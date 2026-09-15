/**
 * Metrics attached to the nodes of the dependency graph.
 *
 * A metric is only worth reading when it is attached to something a reader
 * reasons about — a route, a service, a primitive — rather than to a file. So
 * every decision point is credited to the **innermost** node whose source range
 * contains it: a primitive declared inside a component keeps its own branches,
 * and the component counts them only in its total.
 *
 * - `cyclomaticOwn` is exact: `1 +` the decision points no inner node claims.
 * - `cyclomaticTotal` is `1 +` the decision points of the node and of its
 *   `contains` closure. Nothing is counted twice, because each point has
 *   exactly one owner.
 *
 * Unknown is not zero. A node the graph has no source range for carries no
 * complexity and no line count, and the graph says so in a diagnostic, instead
 * of reporting a reassuring `1`.
 */
import { Node, SyntaxKind } from 'ts-morph';
import { PRODUCES_BACKWARD, PRODUCES_FORWARD } from './code-slice.js';
import type {
  DependencyGraph,
  DependencyGraphDiagnostic,
  DependencyGraphEdgeKind,
  DependencyGraphNode,
  DependencyGraphNodeKind,
} from './dependency-graph.js';

export type DependencyGraphNodeCoverage = {
  /** Statements attributed to this node alone. */
  readonly statements: number;
  readonly covered: number;
};

export type DependencyGraphNodeMetrics = {
  /** Absent when the node has no source range. */
  cyclomaticOwn?: number;
  /** Absent when the node has no source range. */
  cyclomaticTotal?: number;
  /** Absent when the node has no source range. */
  lines?: number;
  fanIn: number;
  fanOut: number;
  /** Absent until a coverage report is applied, and for unknown nodes. */
  coverage?: DependencyGraphNodeCoverage;
};

export const METRICS_UNKNOWN_DIAGNOSTIC = 'CRAFT_GRAPH_METRICS_UNKNOWN';

/**
 * Effect relations, all read forwards: `owner requires-service service`,
 * `service provided-by-layer layer`, `layer composes-layer layer` — a service
 * depends on the layer that implements it.
 *
 * They stay out of the code slice on purpose, so attestation fingerprints do
 * not move with this module, but they are dependencies for every other
 * question: an Effect service nobody "depends on" would rank as unused.
 */
export const EFFECT_DEPENDENCY_EDGES: readonly DependencyGraphEdgeKind[] = [
  'requires-service',
  'provided-by-layer',
  'composes-layer',
];

/** The slice relations plus the Effect ones: what a node's output depends on. */
export const DEPENDENCY_FORWARD: readonly DependencyGraphEdgeKind[] = [
  ...PRODUCES_FORWARD,
  ...EFFECT_DEPENDENCY_EDGES,
];

/**
 * Relations that couple two nodes.
 *
 * The dependency relations, minus `contains`: owning a primitive is structure,
 * not a dependency on it.
 */
export const COUPLING_EDGES: readonly DependencyGraphEdgeKind[] = [
  ...new Set([...DEPENDENCY_FORWARD, ...PRODUCES_BACKWARD]),
].filter((kind) => kind !== 'contains');

/** The source range a node stands for, as offsets in its file. */
export type NodeSourceSpan = {
  readonly filePath: string;
  readonly start: number;
  readonly end: number;
  readonly startLine: number;
  readonly endLine: number;
};

const LOGICAL_OPERATORS = new Set<SyntaxKind>([
  SyntaxKind.AmpersandAmpersandToken,
  SyntaxKind.BarBarToken,
  SyntaxKind.QuestionQuestionToken,
]);

/**
 * Positions of the decision points under `source`, sorted.
 *
 * `if`, `?:`, `case`, the four loops, `catch`, `&&`, `||` and `??`. A logical
 * operator is located at its operator token, so `a && b && c` yields two
 * distinct positions.
 */
export function cyclomaticDecisionPoints(source: Node): readonly number[] {
  const positions: number[] = [];
  const visit = (node: Node): void => {
    switch (node.getKind()) {
      case SyntaxKind.IfStatement:
      case SyntaxKind.ConditionalExpression:
      case SyntaxKind.CaseClause:
      case SyntaxKind.ForStatement:
      case SyntaxKind.ForOfStatement:
      case SyntaxKind.ForInStatement:
      case SyntaxKind.WhileStatement:
      case SyntaxKind.DoStatement:
      case SyntaxKind.CatchClause:
        positions.push(node.getStart());
        break;
      case SyntaxKind.BinaryExpression: {
        const operator = node.asKindOrThrow(SyntaxKind.BinaryExpression)
          .getOperatorToken();
        if (LOGICAL_OPERATORS.has(operator.getKind())) {
          positions.push(operator.getStart());
        }
        break;
      }
      default:
        break;
    }
    node.forEachChild(visit);
  };
  visit(source);
  return positions.sort((left, right) => left - right);
}

export type OwnedRange = {
  readonly id: string;
  readonly start: number;
  /** Exclusive. */
  readonly end: number;
};

/**
 * Finds the innermost range containing a position.
 *
 * Shortest range wins. Two identical ranges are told apart by their depth in
 * the `contains` tree — the contained node is the inner one — then by id, so
 * the answer never depends on discovery order.
 */
export function createInnermostLocator(
  ranges: readonly OwnedRange[],
  depthOf: (id: string) => number = () => 0,
): (position: number) => string | undefined {
  const ordered = [...ranges].sort(
    (left, right) =>
      left.end - left.start - (right.end - right.start) ||
      depthOf(right.id) - depthOf(left.id) ||
      left.id.localeCompare(right.id),
  );
  return (position) =>
    ordered.find((range) => range.start <= position && position < range.end)
      ?.id;
}

/** Depth of every node in the `contains` tree. Roots are 0; cycles are cut. */
export function containsDepths(
  graph: Pick<DependencyGraph, 'edges'>,
): (id: string) => number {
  const parents = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'contains') continue;
    parents.set(edge.to, [...(parents.get(edge.to) ?? []), edge.from]);
  }
  const memo = new Map<string, number>();
  const depth = (id: string, visiting: Set<string>): number => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const value = Math.max(
      0,
      ...(parents.get(id) ?? []).map((parent) => depth(parent, visiting) + 1),
    );
    visiting.delete(id);
    memo.set(id, value);
    return value;
  };
  return (id) => depth(id, new Set());
}

/** Every node reachable from `id` along `contains`, `id` included. */
export function containsClosure(
  children: ReadonlyMap<string, readonly string[]>,
  id: string,
): readonly string[] {
  const seen = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (seen.has(current)) continue;
    seen.add(current);
    queue.push(...(children.get(current) ?? []));
  }
  return [...seen];
}

export function containsChildren(
  graph: Pick<DependencyGraph, 'edges'>,
): ReadonlyMap<string, readonly string[]> {
  const children = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'contains') continue;
    children.set(edge.from, [...(children.get(edge.from) ?? []), edge.to]);
  }
  return children;
}

/** Distinct neighbours along {@link COUPLING_EDGES}, self-loops excluded. */
export function couplingDegrees(
  graph: Pick<DependencyGraph, 'edges'>,
): ReadonlyMap<string, { readonly fanIn: number; readonly fanOut: number }> {
  const coupling = new Set(COUPLING_EDGES);
  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, key: string, value: string) => {
    const known = map.get(key);
    if (known) known.add(value);
    else map.set(key, new Set([value]));
  };
  for (const edge of graph.edges) {
    if (!coupling.has(edge.kind) || edge.from === edge.to) continue;
    add(outgoing, edge.from, edge.to);
    add(incoming, edge.to, edge.from);
  }
  const ids = new Set([...incoming.keys(), ...outgoing.keys()]);
  return new Map(
    [...ids].map((id) => [
      id,
      {
        fanIn: incoming.get(id)?.size ?? 0,
        fanOut: outgoing.get(id)?.size ?? 0,
      },
    ]),
  );
}

/**
 * Computes `metrics` for every node and returns the diagnostics for the nodes
 * whose complexity is unknown.
 *
 * `decisionPointsOf` is asked once per file that holds a span, which keeps the
 * traversal linear in the size of the program rather than in the nesting of
 * its nodes.
 */
export function attachNodeMetrics(
  graph: DependencyGraph,
  spans: ReadonlyMap<string, NodeSourceSpan>,
  decisionPointsOf: (filePath: string) => readonly number[],
): readonly DependencyGraphDiagnostic[] {
  const depthOf = containsDepths(graph);
  const rangesByFile = new Map<string, OwnedRange[]>();
  for (const [id, span] of spans) {
    rangesByFile.set(span.filePath, [
      ...(rangesByFile.get(span.filePath) ?? []),
      { id, start: span.start, end: span.end },
    ]);
  }

  const ownDecisions = new Map<string, number>();
  for (const [filePath, ranges] of rangesByFile) {
    const locate = createInnermostLocator(ranges, depthOf);
    for (const position of decisionPointsOf(filePath)) {
      const owner = locate(position);
      if (owner) ownDecisions.set(owner, (ownDecisions.get(owner) ?? 0) + 1);
    }
  }

  const children = containsChildren(graph);
  const degrees = couplingDegrees(graph);
  const unknownByKind = new Map<DependencyGraphNodeKind, number>();
  for (const node of graph.nodes) {
    const span = spans.get(node.id);
    const { fanIn, fanOut } = degrees.get(node.id) ?? { fanIn: 0, fanOut: 0 };
    if (!span) {
      unknownByKind.set(node.kind, (unknownByKind.get(node.kind) ?? 0) + 1);
      node.metrics = { fanIn, fanOut };
      continue;
    }
    const total = containsClosure(children, node.id).reduce(
      (sum, id) => sum + (ownDecisions.get(id) ?? 0),
      0,
    );
    node.metrics = {
      cyclomaticOwn: 1 + (ownDecisions.get(node.id) ?? 0),
      cyclomaticTotal: 1 + total,
      lines: span.endLine - span.startLine + 1,
      fanIn,
      fanOut,
    };
  }

  return [...unknownByKind]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, count]) => ({
      code: METRICS_UNKNOWN_DIAGNOSTIC,
      message: `${count} ${kind} node${count === 1 ? ' has' : 's have'} no source range: complexity and line count are unknown, not zero.`,
    }));
}

/* ------------------------------------------------------------------------ *
 * Rankings
 * ------------------------------------------------------------------------ */

export type RankedNode = {
  readonly id: string;
  readonly kind: DependencyGraphNodeKind;
  readonly label: string;
  readonly filePath?: string;
  readonly line?: number;
  readonly fanIn: number;
  readonly fanOut: number;
  readonly cyclomaticTotal?: number;
};

export type Hotspot = RankedNode & {
  readonly cyclomaticTotal: number;
  readonly churn: number;
  readonly score: number;
};

export type RankingOptions = {
  readonly limit?: number;
  readonly kinds?: readonly DependencyGraphNodeKind[];
};

export type HotspotOptions = RankingOptions & {
  /**
   * Commits touching each file, keyed by the absolute path stored in
   * `node.filePath`. A file absent from the map counts as zero changes.
   */
  readonly churn?: ReadonlyMap<string, number>;
};

const DEFAULT_RANKING_LIMIT = 10;

/**
 * Commits per file, from `git log --name-only --pretty=format:` output.
 *
 * Git prints paths relative to the repository root, once per commit; they are
 * resolved against `repositoryRoot` so the keys match `node.filePath`.
 */
export function churnFromGitLog(
  log: string,
  repositoryRoot: string,
): ReadonlyMap<string, number> {
  const root = repositoryRoot.split('\\').join('/').replace(/\/+$/, '');
  const churn = new Map<string, number>();
  for (const line of log.split(/\r?\n/)) {
    const path = line.trim();
    if (!path) continue;
    const absolute = `${root}/${path}`;
    churn.set(absolute, (churn.get(absolute) ?? 0) + 1);
  }
  return churn;
}

function ranked(node: DependencyGraphNode): RankedNode {
  return {
    id: node.id,
    kind: node.kind,
    label: node.label,
    ...(node.filePath === undefined ? {} : { filePath: node.filePath }),
    ...(node.line === undefined ? {} : { line: node.line }),
    fanIn: node.metrics?.fanIn ?? 0,
    fanOut: node.metrics?.fanOut ?? 0,
    ...(node.metrics?.cyclomaticTotal === undefined
      ? {}
      : { cyclomaticTotal: node.metrics.cyclomaticTotal }),
  };
}

function ofKinds(
  graph: DependencyGraph,
  kinds: readonly DependencyGraphNodeKind[] | undefined,
): DependencyGraphNode[] {
  const allowed = kinds && new Set(kinds);
  return graph.nodes.filter((node) => !allowed || allowed.has(node.kind));
}

/** The nodes most depended upon: `fanIn` descending, then id. */
export function godNodes(
  graph: DependencyGraph,
  options: RankingOptions = {},
): readonly RankedNode[] {
  return ofKinds(graph, options.kinds)
    .map(ranked)
    .filter((node) => node.fanIn > 0)
    .sort(
      (left, right) =>
        right.fanIn - left.fanIn || left.id.localeCompare(right.id),
    )
    .slice(0, options.limit ?? DEFAULT_RANKING_LIMIT);
}

/**
 * Complex code many things depend on and that keeps changing.
 *
 * `score = cyclomaticTotal × (1 + fanIn) × (1 + churn)`. A node whose
 * complexity is unknown is left out rather than ranked as simple.
 */
export function graphHotspots(
  graph: DependencyGraph,
  options: HotspotOptions = {},
): readonly Hotspot[] {
  return ofKinds(graph, options.kinds)
    .flatMap((node): Hotspot[] => {
      const base = ranked(node);
      if (base.cyclomaticTotal === undefined) return [];
      const churn =
        (node.filePath && options.churn?.get(node.filePath)) || 0;
      return [
        {
          ...base,
          cyclomaticTotal: base.cyclomaticTotal,
          churn,
          score: base.cyclomaticTotal * (1 + base.fanIn) * (1 + churn),
        },
      ];
    })
    .sort(
      (left, right) =>
        right.score - left.score || left.id.localeCompare(right.id),
    )
    .slice(0, options.limit ?? DEFAULT_RANKING_LIMIT);
}
