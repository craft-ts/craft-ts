import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  architectureViolations,
  dependencyGraphPathsBetween,
  relativeGraphPath,
} from '@craft-ts/dev-tools/architecture-graph';
import type {
  DependencyGraph,
  DependencyGraphEdge,
  DependencyGraphNode,
  DependencyGraphNodeKind,
  DependencyGraphProof,
} from '@craft-ts/dev-tools/dependency-graph';
import { DEPENDENCY_FORWARD } from '@craft-ts/dev-tools/graph-metrics';
import { graphReport } from '@craft-ts/dev-tools/graph-report';
import {
  createSliceIndex,
  impactOf,
  portableNodeId,
} from '@craft-ts/dev-tools/scripts/code-slice.js';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { GraphStore } from './graph-store.js';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false } as const;
const MAX_SOURCE_LINES = 200;

type NodeSummary = {
  id: string;
  kind: string;
  label: string;
  location?: string;
  metrics?: DependencyGraphNode['metrics'];
};

export function createGraphMcpServer(store: GraphStore): McpServer {
  const server = new McpServer({ name: 'craft-ts-graph', version: '0.1.0' });

  server.registerTool(
    'graph.status',
    {
      description:
        'State of the CraftTS dependency graph: where it was loaded from, when it was built, whether source files changed since (`stale`), node and relation counts, and diagnostics. Call it first.',
      annotations: READ_ONLY,
    },
    async () =>
      respond(store, (graph) => {
        const loaded = store.get();
        return {
          graphFile: store.options.graphFile,
          source: loaded.source,
          builtAt: new Date(loaded.builtAt).toISOString(),
          readonly: store.options.readonly,
          nodes: graph.nodes.length,
          edges: graph.edges.length,
          nodesByKind: countBy(graph.nodes, (node) => node.kind),
          diagnostics: countBy(
            graph.diagnostics ?? [],
            (diagnostic) => diagnostic.code,
          ),
          newestSource: store.freshness().newestSource,
        };
      }),
  );

  if (!store.options.readonly) {
    server.registerTool(
      'graph.rebuild',
      {
        description:
          'Re-analyse the TypeScript program and overwrite the graph JSON file. Use it when graph.status reports `stale: true`. Takes seconds on a large application.',
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
        },
      },
      async () =>
        respond(store, () => {
          const { graph, builtAt } = store.rebuild();
          return {
            graphFile: store.options.graphFile,
            builtAt: new Date(builtAt).toISOString(),
            nodes: graph.nodes.length,
            edges: graph.edges.length,
          };
        }),
    );
  }

  server.registerTool(
    'graph.search',
    {
      description:
        'Find nodes (routes, components, services, primitives…) by a case-insensitive substring of their label or id. Exact label matches come first.',
      inputSchema: {
        text: z.string().min(1),
        kind: z.string().min(1).optional().describe('Keep only this node kind'),
        limit: z.number().int().positive().max(200).optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ text, kind, limit }) =>
      respond(store, (graph) => {
        const needle = text.toLowerCase();
        const rank = (node: DependencyGraphNode): number => {
          const label = node.label.toLowerCase();
          if (label === needle) return 0;
          if (label.startsWith(needle)) return 1;
          if (label.includes(needle)) return 2;
          return node.id.toLowerCase().includes(needle) ? 3 : -1;
        };
        const matches = graph.nodes
          .filter((node) => !kind || node.kind === kind)
          .map((node) => ({ node, rank: rank(node) }))
          .filter((entry) => entry.rank >= 0)
          .sort(
            (left, right) =>
              left.rank - right.rank ||
              compare(left.node.label, right.node.label) ||
              compare(left.node.id, right.node.id),
          )
          .map((entry) => summary(graph, entry.node));
        return { ...limited('nodes', matches, limit ?? 20) };
      }),
  );

  server.registerTool(
    'graph.node',
    {
      description:
        'One node with its metrics, details, incoming and outgoing relations with their proofs, and optionally its source code. Address it by `id`, or by `label` (plus `kind` when the label is shared).',
      inputSchema: {
        id: z.string().min(1).optional(),
        label: z.string().min(1).optional(),
        kind: z.string().min(1).optional(),
        includeSource: z.boolean().optional(),
        limit: z
          .number()
          .int()
          .positive()
          .max(500)
          .optional()
          .describe('Maximum relations per direction (default 50)'),
      },
      annotations: READ_ONLY,
    },
    async ({ id, label, kind, includeSource, limit }) =>
      respond(store, (graph) => {
        const lookup = lookupNode(graph, { id, label, kind });
        if ('candidates' in lookup) return lookup;
        const node = lookup.node;
        const nodesById = new Map(graph.nodes.map((entry) => [entry.id, entry]));
        const relation = (edge: DependencyGraphEdge, otherId: string) => {
          const other = nodesById.get(otherId);
          const proof = proofOf(graph, edge.proof);
          return {
            kind: edge.kind,
            evidence: edge.evidence,
            node: other
              ? { id: other.id, kind: other.kind, label: other.label }
              : { id: otherId },
            ...(proof ? { proof } : {}),
            ...(edge.details ? { details: edge.details } : {}),
          };
        };
        const max = limit ?? 50;
        return {
          node: {
            ...summary(graph, node),
            ...(node.endLine === undefined ? {} : { endLine: node.endLine }),
            ...(node.doc ? { doc: node.doc } : {}),
            ...(node.details ? { details: node.details } : {}),
          },
          incoming: limited(
            'edges',
            graph.edges
              .filter((edge) => edge.to === node.id)
              .map((edge) => relation(edge, edge.from)),
            max,
          ),
          outgoing: limited(
            'edges',
            graph.edges
              .filter((edge) => edge.from === node.id)
              .map((edge) => relation(edge, edge.to)),
            max,
          ),
          ...(includeSource ? { source: sourceOf(graph, node) } : {}),
        };
      }),
  );

  server.registerTool(
    'graph.neighbors',
    {
      description:
        'The subgraph around a node, up to `depth` relations away (at most 3), optionally restricted to some relation kinds and one direction.',
      inputSchema: {
        id: z.string().min(1),
        depth: z.number().int().min(1).max(3).optional(),
        edgeKinds: z.array(z.string().min(1)).optional(),
        direction: z.enum(['out', 'in', 'both']).optional(),
        limit: z.number().int().positive().max(500).optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ id, depth, edgeKinds, direction, limit }) =>
      respond(store, (graph) => {
        const root = resolveNodeId(graph, id);
        const kinds = edgeKinds && new Set(edgeKinds);
        const way = direction ?? 'both';
        const distance = new Map([[root, 0]]);
        const traversed = new Set<DependencyGraphEdge>();
        let frontier = [root];
        for (let level = 1; level <= (depth ?? 1); level += 1) {
          const next: string[] = [];
          for (const edge of graph.edges) {
            if (kinds && !kinds.has(edge.kind)) continue;
            const pairs: [string, string][] = [];
            if (way !== 'in') pairs.push([edge.from, edge.to]);
            if (way !== 'out') pairs.push([edge.to, edge.from]);
            for (const [here, there] of pairs) {
              if (!frontier.includes(here)) continue;
              traversed.add(edge);
              if (!distance.has(there)) {
                distance.set(there, level);
                next.push(there);
              }
            }
          }
          frontier = next;
        }
        const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
        const nodes = [...distance]
          .sort(([leftId, left], [rightId, right]) => left - right || compare(leftId, rightId))
          .flatMap(([nodeId, hops]) => {
            const node = nodesById.get(nodeId);
            return node ? [{ ...summary(graph, node), distance: hops }] : [];
          });
        const kept = limited('nodes', nodes, limit ?? 100);
        const keptIds = new Set(kept.nodes.map((node) => node.id));
        return {
          ...kept,
          edges: [...traversed]
            .filter((edge) => keptIds.has(edge.from) && keptIds.has(edge.to))
            .map((edge) => ({ from: edge.from, kind: edge.kind, to: edge.to })),
        };
      }),
  );

  server.registerTool(
    'graph.path',
    {
      description:
        'The shortest chains of relations from one node to another, following relation direction, with the proof of each step.',
      inputSchema: {
        from: z.string().min(1),
        to: z.string().min(1),
        maxDepth: z.number().int().min(1).max(12).optional(),
        limit: z.number().int().positive().max(20).optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ from, to, maxDepth, limit }) =>
      respond(store, (graph) => {
        const fromId = resolveNodeId(graph, from);
        const toId = resolveNodeId(graph, to);
        const length = shortestDistance(graph, fromId, toId, maxDepth ?? 8);
        if (length === undefined) {
          return { reachable: false, paths: [], total: 0, truncated: false };
        }
        const paths = dependencyGraphPathsBetween(graph, fromId, toId, length).map(
          (path) => ({
            length: path.edges.length,
            nodes: path.nodes.map((node) => ({
              id: node.id,
              kind: node.kind,
              label: node.label,
            })),
            edges: path.edges.map((edge) => {
              const proof = proofOf(graph, edge.proof);
              return {
                from: edge.from,
                kind: edge.kind,
                to: edge.to,
                ...(proof ? { proof } : {}),
              };
            }),
          }),
        );
        return { reachable: true, ...limited('paths', paths, limit ?? 5) };
      }),
  );

  server.registerTool(
    'graph.impact',
    {
      description:
        'Every node whose output may change when this node changes: the nodes whose code slice contains it, following the visual attestation slice relations plus Effect service requirements and layers.',
      inputSchema: {
        id: z.string().min(1),
        kind: z.string().min(1).optional().describe('Keep only this node kind'),
        limit: z.number().int().positive().max(1000).optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ id, kind, limit }) =>
      respond(store, (graph) => {
        const nodeId = resolveNodeId(graph, id);
        const index = createSliceIndex(graph, {
          readFile: () => undefined,
          forward: DEPENDENCY_FORWARD,
        });
        const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
        const impacted = impactOf(index, nodeId)
          .filter((candidate) => candidate !== nodeId)
          .flatMap((candidate) => {
            const node = nodesById.get(candidate);
            return node && (!kind || node.kind === kind) ? [node] : [];
          })
          .sort(
            (left, right) =>
              compare(left.kind, right.kind) || compare(left.label, right.label),
          )
          .map((node) => summary(graph, node));
        const node = nodesById.get(nodeId) as DependencyGraphNode;
        return {
          node: { id: node.id, kind: node.kind, label: node.label },
          ...limited('impacted', impacted, limit ?? 100),
        };
      }),
  );

  const reportInput = {
    limit: z.number().int().positive().max(100).optional(),
    churnSince: z
      .string()
      .min(1)
      .optional()
      .describe('Weigh hotspots by commits since this git date, e.g. "3 months ago"'),
  };

  server.registerTool(
    'graph.hotspots',
    {
      description:
        'God nodes (most depended upon) and hotspots: total complexity × (1 + fan-in) × (1 + churn). Nodes of unknown complexity are left out, not ranked as simple.',
      inputSchema: {
        ...reportInput,
        kinds: z.array(z.string().min(1)).optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ limit, churnSince, kinds }) =>
      respond(store, (graph) => {
        const report = graphReport(graph, {
          ...(limit ? { limit } : {}),
          // The kind registry is open to module augmentation: an unknown kind
          // selects nothing rather than being rejected.
          ...(kinds ? { kinds: kinds as DependencyGraphNodeKind[] } : {}),
          ...(churnSince ? { churn: store.churnSince(churnSince) } : {}),
        });
        return { godNodes: report.godNodes, hotspots: report.hotspots };
      }),
  );

  server.registerTool(
    'graph.report',
    {
      description:
        'The synthetic architecture report: summary, god nodes, hotspots, dependency cycles, unused primitive methods, cross-feature relations and architecture violations. Ids are portable (relative paths).',
      inputSchema: {
        ...reportInput,
        featureGlob: z
          .string()
          .min(1)
          .optional()
          .describe('Path glob with one :name capture, e.g. src/features/:feature/**'),
      },
      annotations: READ_ONLY,
    },
    async ({ limit, churnSince, featureGlob }) =>
      respond(store, (graph) =>
        graphReport(graph, {
          ...(limit ? { limit } : {}),
          ...(featureGlob ? { featureGlob } : {}),
          ...(churnSince ? { churn: store.churnSince(churnSince) } : {}),
        }),
      ),
  );

  server.registerTool(
    'graph.violations',
    {
      description:
        'The architecture rules assertArchitecture enforces, as named rules with their messages. An empty list means the graph passes.',
      inputSchema: {
        target: z.enum(['development', 'production']).optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ target }) =>
      respond(store, (graph) => {
        const rules = architectureViolations(graph, target ? { target } : {});
        return {
          rules,
          total: rules.reduce((sum, rule) => sum + rule.messages.length, 0),
        };
      }),
  );

  return server;
}

/* ------------------------------------------------------------------------ */

function respond(
  store: GraphStore,
  compute: (graph: DependencyGraph) => unknown,
) {
  try {
    const result = compute(store.get().graph);
    const { stale } = store.freshness();
    return toolResult({ stale, ...(result as Record<string, unknown>) });
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

function toolResult(result: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    structuredContent: result,
  };
}

const compare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

function countBy<T>(
  values: readonly T[],
  key: (value: T) => string,
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(key(value), (counts.get(key(value)) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts].sort(([left], [right]) => compare(left, right)),
  );
}

function limited<K extends string, T>(
  key: K,
  values: readonly T[],
  limit: number,
): Record<K, T[]> & { total: number; truncated: boolean } {
  return {
    [key]: values.slice(0, limit),
    total: values.length,
    truncated: values.length > limit,
  } as Record<K, T[]> & { total: number; truncated: boolean };
}

function locationOf(
  graph: DependencyGraph,
  filePath: string | undefined,
  line: number | undefined,
): string | undefined {
  const path = relativeGraphPath(graph, filePath);
  if (!path) return undefined;
  return line === undefined ? path : `${path}:${line}`;
}

function summary(graph: DependencyGraph, node: DependencyGraphNode): NodeSummary {
  const location = locationOf(graph, node.filePath, node.line);
  return {
    id: node.id,
    kind: node.kind,
    label: node.label,
    ...(location === undefined ? {} : { location }),
    ...(node.metrics ? { metrics: node.metrics } : {}),
  };
}

function proofOf(
  graph: DependencyGraph,
  proof: DependencyGraphProof | undefined,
) {
  if (!proof) return undefined;
  return {
    location: locationOf(graph, proof.filePath, proof.line),
    ...(proof.symbol ? { symbol: proof.symbol } : {}),
    ...(proof.pattern ? { pattern: proof.pattern } : {}),
  };
}

/** Accepts a graph id or its portable form (checkout root removed). */
export function resolveNodeId(graph: DependencyGraph, id: string): string {
  if (graph.nodes.some((node) => node.id === id)) return id;
  const matches = graph.nodes.filter(
    (node) => portableNodeId(node.id, graph.rootDir) === id,
  );
  if (matches.length === 1) return (matches[0] as DependencyGraphNode).id;
  if (matches.length > 1) {
    throw new Error(`'${id}' matches ${matches.length} nodes. Use the full id.`);
  }
  throw new Error(`No node '${id}' in the graph. Find it with graph.search.`);
}

function lookupNode(
  graph: DependencyGraph,
  query: { id?: string; label?: string; kind?: string },
): { node: DependencyGraphNode } | { ambiguous: true; candidates: NodeSummary[] } {
  if (query.id) {
    const id = resolveNodeId(graph, query.id);
    return { node: graph.nodes.find((node) => node.id === id) as DependencyGraphNode };
  }
  if (!query.label) throw new Error('graph.node needs an `id` or a `label`.');
  const matches = graph.nodes.filter(
    (node) =>
      node.label === query.label && (!query.kind || node.kind === query.kind),
  );
  if (matches.length === 0) {
    throw new Error(
      `No node labelled '${query.label}'${query.kind ? ` of kind ${query.kind}` : ''}. Find it with graph.search.`,
    );
  }
  if (matches.length > 1) {
    return {
      ambiguous: true,
      candidates: matches.map((node) => summary(graph, node)),
    };
  }
  return { node: matches[0] as DependencyGraphNode };
}

function sourceOf(graph: DependencyGraph, node: DependencyGraphNode) {
  if (!node.filePath || node.line === undefined) {
    return { available: false, reason: 'The node has no source location.' };
  }
  let text: string;
  try {
    text = readFileSync(node.filePath, 'utf8');
  } catch {
    return { available: false, reason: `Cannot read ${node.filePath}.` };
  }
  const lines = text.split(/\r?\n/);
  const first = node.line;
  const last = node.endLine ?? node.line;
  const shown = Math.min(last, first + MAX_SOURCE_LINES - 1);
  return {
    available: true,
    location: `${relativeGraphPath(graph, node.filePath)}:${first}-${last}`,
    ...(node.endLine === undefined
      ? { note: 'No end line is known for this node: only its first line is shown.' }
      : {}),
    code: lines.slice(first - 1, shown).join('\n'),
    truncated: shown < last,
  };
}

function shortestDistance(
  graph: DependencyGraph,
  fromId: string,
  toId: string,
  maxDepth: number,
): number | undefined {
  if (fromId === toId) return 0;
  const outgoing = new Map<string, string[]>();
  for (const edge of graph.edges) {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
  }
  const seen = new Set([fromId]);
  let frontier = [fromId];
  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const target of outgoing.get(id) ?? []) {
        if (target === toId) return depth;
        if (!seen.has(target)) {
          seen.add(target);
          next.push(target);
        }
      }
    }
    frontier = next;
  }
  return undefined;
}
