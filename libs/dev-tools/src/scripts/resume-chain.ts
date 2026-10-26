import type {
  DependencyGraph,
  DependencyGraphEdge,
  DependencyGraphNode,
} from './dependency-graph';

export type ResumeLeafClassification =
  | 'client'
  | 'external-read'
  | 'acquisition'
  | 'external-mutation';

export interface ResumeChainPath {
  readonly leafId: string;
  readonly nodeIds: readonly string[];
  readonly edgeKeys: readonly string[];
  readonly classification: ResumeLeafClassification;
}

export interface ResumeChain {
  readonly rootId: string;
  readonly paths: readonly ResumeChainPath[];
  readonly nodes: readonly DependencyGraphNode[];
  readonly edges: readonly DependencyGraphEdge[];
}

export interface ResumeGraphArtifact {
  readonly format: 'craft-resume-graph';
  readonly version: 1;
  readonly sourceHashes: Readonly<Record<string, string>>;
  readonly nodes: readonly Readonly<{
    id: string;
    kind: string;
    label: string;
    sourceHash?: string;
    details?: Readonly<Record<string, unknown>>;
  }>[];
  readonly edges: readonly DependencyGraphEdge[];
}

export interface ResumeGraphDiagnostic {
  readonly code:
    | 'resume-unresolved'
    | 'resume-requires-without-provider'
    | 'resume-dynamic-endpoint'
    | 'resume-computed-calls-boundary';
  readonly nodeId: string;
  readonly message: string;
}

/** Static guardrails for declarations that participate in a resume chain. */
export function checkResumeGraph(
  graph: DependencyGraph,
): readonly ResumeGraphDiagnostic[] {
  const diagnostics: ResumeGraphDiagnostic[] = [];
  const declarations = graph.nodes.flatMap((node) => {
    const resume = node.details?.['resume'];
    return node.kind === 'primitive' && resume && typeof resume === 'object'
      ? [{ node, resume: resume as Record<string, unknown> }]
      : [];
  });
  for (const { node, resume } of declarations) {
    const resource = typeof resume['resource'] === 'string' ? resume['resource'] : '';
    const role = resume['role'];
    if (
      role === 'requires' &&
      !declarations.some((candidate) =>
        candidate.resume['resource'] === resource &&
        candidate.resume['role'] === 'provides',
      )
    ) {
      diagnostics.push({
        code: 'resume-requires-without-provider',
        nodeId: node.id,
        message: `No primitive provides required resource '${resource}'.`,
      });
    }
  }
  for (const primitive of graph.nodes.filter((node) => node.kind === 'primitive')) {
    const persisted = primitive.details?.['persisted'] === true;
    const hasResume = primitive.details?.['resume'] !== undefined;
    const external = graph.edges.some(
      (edge) => edge.from === primitive.id && edge.kind === 'calls' &&
        graph.nodes.some((node) => node.id === edge.to &&
          (node.kind === 'server-function-family' || node.kind === 'http-endpoint')),
    );
    if (persisted && external && !hasResume) {
      diagnostics.push({
        code: 'resume-unresolved',
        nodeId: primitive.id,
        message: `Persisted primitive '${primitive.label}' calls an external boundary without a resume declaration.`,
      });
    }
  }
  for (const endpoint of graph.nodes.filter((node) => node.kind === 'http-endpoint')) {
    const dynamic = typeof endpoint.details?.['url'] === 'string' &&
      /\$\{|<dynamic>|\*/.test(String(endpoint.details['url']));
    const calledByResume = graph.edges.some((edge) =>
      edge.to === endpoint.id && edge.kind === 'calls' &&
      declarations.some(({ node }) => node.id === edge.from),
    );
    if (dynamic && calledByResume) {
      diagnostics.push({
        code: 'resume-dynamic-endpoint',
        nodeId: endpoint.id,
        message: `Dynamic endpoint '${endpoint.label}' needs an explicit HTTP contract.`,
      });
    }
  }
  // A derived value only reads: a `calls` edge from a craftComputed to a
  // server function would make every reader of it look like a writer.
  for (const computed of graph.nodes.filter(
    (node) => node.kind === 'primitive' && node.label.startsWith('craftComputed:'),
  )) {
    for (const edge of graph.edges) {
      if (edge.from !== computed.id || edge.kind !== 'calls') continue;
      const target = graph.nodes.find((node) => node.id === edge.to);
      if (
        target?.kind === 'server-function-family' ||
        target?.kind === 'http-endpoint'
      )
        diagnostics.push({
          code: 'resume-computed-calls-boundary',
          nodeId: computed.id,
          message: `Derived value '${computed.label}' calls external boundary '${target.label}'.`,
        });
    }
  }
  return diagnostics.sort((left, right) =>
    `${left.code}:${left.nodeId}`.localeCompare(`${right.code}:${right.nodeId}`),
  );
}

const RESUME_RELATIONS = new Set([
  'depends-on',
  'writes',
  'calls',
  'triggers',
]);

/**
 * Finds the static provider and external-operation leaves that can influence a
 * primitive. Dependency edges point to values read; writes and trigger edges
 * are followed backwards to discover what can produce those values.
 */
export function resumeChainOf(
  graph: DependencyGraph,
  primitiveId: string,
): ResumeChain {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const root = nodesById.get(primitiveId);
  if (!root) throw new Error(`Unknown dependency graph node '${primitiveId}'.`);

  const outgoing = new Map<string, DependencyGraphEdge[]>();
  const incoming = new Map<string, DependencyGraphEdge[]>();
  for (const edge of graph.edges) {
    if (!RESUME_RELATIONS.has(edge.kind)) continue;
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge]);
  }

  const paths: ResumeChainPath[] = [];
  const usedEdges = new Map<string, DependencyGraphEdge>();
  const usedNodes = new Set<string>([primitiveId]);
  const queue: { nodeId: string; nodeIds: string[]; edgeKeys: string[] }[] = [
    { nodeId: primitiveId, nodeIds: [primitiveId], edgeKeys: [] },
  ];
  const bestDepth = new Map<string, number>([[primitiveId, 0]]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const candidates = [
      ...(outgoing.get(current.nodeId) ?? []).map((edge) => ({
        edge,
        nextId: edge.to,
      })),
      ...(incoming.get(current.nodeId) ?? [])
        .filter((edge) => edge.kind === 'writes' || edge.kind === 'triggers')
        .map((edge) => ({ edge, nextId: edge.from })),
    ].sort((left, right) => {
      const a = `${left.edge.kind}:${left.nextId}`;
      const b = `${right.edge.kind}:${right.nextId}`;
      return a.localeCompare(b);
    });
    let extended = false;
    for (const { edge, nextId } of candidates) {
      if (current.nodeIds.includes(nextId) || !nodesById.has(nextId)) continue;
      const edgeKey = `${edge.from}:${edge.kind}:${edge.to}`;
      usedEdges.set(edgeKey, edge);
      usedNodes.add(nextId);
      extended = true;
      const nextNodeIds = [...current.nodeIds, nextId];
      const nextEdgeKeys = [...current.edgeKeys, edgeKey];
      const previousDepth = bestDepth.get(nextId);
      if (previousDepth !== undefined) continue;
      bestDepth.set(nextId, nextNodeIds.length);
      queue.push({
        nodeId: nextId,
        nodeIds: nextNodeIds,
        edgeKeys: nextEdgeKeys,
      });
    }
    if (!extended) {
      const leaf = nodesById.get(current.nodeId);
      if (leaf) {
        paths.push({
          leafId: leaf.id,
          nodeIds: current.nodeIds,
          edgeKeys: current.edgeKeys,
          classification: classifyResumeLeaf(leaf, graph.edges),
        });
      }
    }
  }

  const uniquePaths = new Map<string, ResumeChainPath>();
  for (const path of paths) {
    const key = `${path.leafId}:${path.nodeIds.join('>')}`;
    if (!uniquePaths.has(key)) uniquePaths.set(key, path);
  }
  return {
    rootId: primitiveId,
    paths: [...uniquePaths.values()].sort((a, b) =>
      `${a.classification}:${a.leafId}:${a.nodeIds.join('>')}`.localeCompare(
        `${b.classification}:${b.leafId}:${b.nodeIds.join('>')}`,
      ),
    ),
    nodes: [...usedNodes]
      .map((id) => nodesById.get(id))
      .filter((node): node is DependencyGraphNode => node !== undefined),
    edges: [...usedEdges.values()],
  };
}

/** Extracts the compact, serializable graph consumed by the resume planner. */
export function resumeGraphArtifactOf(
  graph: DependencyGraph,
): ResumeGraphArtifact {
  const includedKinds = new Set([
    'service',
    'primitive',
    'http-endpoint',
    'server-function-family',
    'server-function-contract',
    'server-function-client',
    'server-function-server',
  ]);
  const relationKinds = new Set([
    'depends-on',
    'writes',
    'calls',
    'triggers',
    'provides',
  ]);
  const nodes = graph.nodes
    .filter((node) => includedKinds.has(node.kind))
    .map((node) => {
      const details = node.details;
      const projectedDetails = details
        ? Object.fromEntries(
            Object.entries(details).filter(([key]) =>
              [
                'primitive',
                'name',
                'ownerId',
                'usage',
                'exposedMethods',
                'method',
                'url',
                'family',
                'serverFunctionId',
                'resourceRole',
                'resume',
              ].includes(key),
            ),
          )
        : undefined;
      return {
        id: node.id,
        kind: node.kind,
        label: node.label,
        ...(node.sourceHash ? { sourceHash: node.sourceHash } : {}),
        ...(projectedDetails && Object.keys(projectedDetails).length > 0
          ? { details: projectedDetails }
          : {}),
      };
    });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter(
    (edge) =>
      relationKinds.has(edge.kind) &&
      nodeIds.has(edge.from) &&
      nodeIds.has(edge.to),
  );
  return {
    format: 'craft-resume-graph',
    version: 1,
    sourceHashes: Object.fromEntries(
      nodes.flatMap((node) =>
        node.sourceHash ? [[node.id, node.sourceHash] as const] : [],
      ),
    ),
    nodes,
    edges,
  };
}

function classifyResumeLeaf(
  node: DependencyGraphNode,
  edges: readonly DependencyGraphEdge[],
): ResumeLeafClassification {
  if (node.kind === 'http-endpoint') {
    const method = String(node.details?.['method'] ?? 'GET').toUpperCase();
    return ['GET', 'HEAD', 'OPTIONS'].includes(method)
      ? 'external-read'
      : 'external-mutation';
  }
  if (node.kind === 'server-function-family') {
    const outbound = edges.find(
      (edge) => edge.from === node.id && edge.kind === 'calls',
    );
    return outbound?.details?.['resourceRole'] === 'acquisition'
      ? 'acquisition'
      : 'external-mutation';
  }
  if (node.kind === 'primitive') {
    const primitive = String(node.details?.['primitive'] ?? '');
    const hasOutboundCall = edges.some(
      (edge) => edge.from === node.id && edge.kind === 'calls',
    );
    if (hasOutboundCall && primitive === 'query') return 'external-read';
    if (hasOutboundCall && primitive.toLowerCase().includes('mutation')) {
      return 'external-mutation';
    }
  }
  return 'client';
}
