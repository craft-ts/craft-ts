/**
 * Test coverage attached to graph nodes, read from an Istanbul report.
 *
 * The coverage is read, never produced: `vitest run --coverage
 * --coverage.reporter=json` writes `coverage-final.json`, and this module only
 * decides which node each statement belongs to.
 *
 * Attribution follows the metrics: a statement is credited to the innermost
 * node whose line range contains its first line, so a route's coverage is the
 * sum over its slice without counting a statement twice. The JSON graph only
 * keeps lines, so two nodes on the same lines are told apart by the `contains`
 * tree.
 *
 * A node without a line range, or in a file the report does not mention, has
 * no coverage — not 0 %. Absent from the report means "not measured": the
 * report may cover a single project, or `coverage.all` may be off.
 */
import { isAbsolute, resolve } from 'node:path';
import { relativeGraphPath } from './architecture-graph.js';
import { closureOf, createSliceIndex } from './code-slice.js';
import type {
  DependencyGraph,
  DependencyGraphDiagnostic,
  DependencyGraphNode,
  DependencyGraphNodeKind,
} from './dependency-graph.js';
import {
  containsDepths,
  couplingDegrees,
  createInnermostLocator,
  DEPENDENCY_FORWARD,
  type DependencyGraphNodeCoverage,
  type OwnedRange,
} from './graph-metrics.js';

export type IstanbulPosition = {
  readonly line: number;
  readonly column?: number | null;
};

export type IstanbulFileCoverage = {
  readonly path?: string;
  readonly statementMap: Readonly<
    Record<string, { readonly start: IstanbulPosition; readonly end: IstanbulPosition }>
  >;
  readonly s: Readonly<Record<string, number>>;
};

/** The content of `coverage-final.json`, keyed by file path. */
export type IstanbulCoverageMap = Readonly<Record<string, IstanbulFileCoverage>>;

export const COVERAGE_UNKNOWN_DIAGNOSTIC = 'CRAFT_GRAPH_COVERAGE_UNKNOWN';

export type ApplyCoverageOptions = {
  /** Resolves relative report paths. Defaults to `graph.rootDir`. */
  readonly rootDir?: string;
};

const normalise = (path: string): string => path.split('\\').join('/');

/**
 * Returns a copy of the graph whose measured nodes carry
 * `metrics.coverage = { statements, covered }` — their own statements only.
 *
 * Applying a second report replaces the first: previous coverage and previous
 * coverage diagnostics are dropped.
 */
export function applyCoverage(
  graph: DependencyGraph,
  coverage: IstanbulCoverageMap,
  options: ApplyCoverageOptions = {},
): DependencyGraph {
  const root = options.rootDir ?? graph.rootDir;
  const files = new Map<string, IstanbulFileCoverage>();
  for (const [key, file] of Object.entries(coverage)) {
    const path = file.path ?? key;
    files.set(normalise(isAbsolute(path) ? path : resolve(root, path)), file);
  }

  const noRange = new Map<DependencyGraphNodeKind, number>();
  const notReported = new Map<DependencyGraphNodeKind, number>();
  const increment = (
    counts: Map<DependencyGraphNodeKind, number>,
    kind: DependencyGraphNodeKind,
  ) => counts.set(kind, (counts.get(kind) ?? 0) + 1);

  const rangesByFile = new Map<string, OwnedRange[]>();
  for (const node of graph.nodes) {
    if (!node.filePath || node.line === undefined || node.endLine === undefined) {
      increment(noRange, node.kind);
      continue;
    }
    const filePath = normalise(node.filePath);
    if (!files.has(filePath)) {
      increment(notReported, node.kind);
      continue;
    }
    rangesByFile.set(filePath, [
      ...(rangesByFile.get(filePath) ?? []),
      { id: node.id, start: node.line, end: node.endLine + 1 },
    ]);
  }

  const measured = new Map<string, { statements: number; covered: number }>();
  const depthOf = containsDepths(graph);
  for (const [filePath, ranges] of rangesByFile) {
    for (const range of ranges) measured.set(range.id, { statements: 0, covered: 0 });
    const locate = createInnermostLocator(ranges, depthOf);
    const file = files.get(filePath) as IstanbulFileCoverage;
    for (const [statementId, location] of Object.entries(file.statementMap)) {
      const owner = locate(location.start.line);
      if (!owner) continue;
      const counts = measured.get(owner) as { statements: number; covered: number };
      counts.statements += 1;
      if ((file.s[statementId] ?? 0) > 0) counts.covered += 1;
    }
  }

  const degrees = couplingDegrees(graph);
  const nodes = graph.nodes.map((node): DependencyGraphNode => {
    const { coverage: _previous, ...metrics } = node.metrics ?? {
      fanIn: degrees.get(node.id)?.fanIn ?? 0,
      fanOut: degrees.get(node.id)?.fanOut ?? 0,
    };
    const own: DependencyGraphNodeCoverage | undefined = measured.get(node.id);
    return { ...node, metrics: own ? { ...metrics, coverage: own } : metrics };
  });

  const describe = (
    counts: Map<DependencyGraphNodeKind, number>,
    reason: string,
  ): DependencyGraphDiagnostic[] =>
    [...counts]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([kind, count]) => ({
        code: COVERAGE_UNKNOWN_DIAGNOSTIC,
        message: `${count} ${kind} node${count === 1 ? '' : 's'} ${reason}: coverage is unknown, not 0 %.`,
      }));

  const diagnostics = [
    ...(graph.diagnostics ?? []).filter(
      (diagnostic) => diagnostic.code !== COVERAGE_UNKNOWN_DIAGNOSTIC,
    ),
    ...describe(noRange, count(noRange) === 1 ? 'has no line range' : 'have no line range'),
    ...describe(notReported, 'in files absent from the coverage report'),
  ];

  const { diagnostics: _dropped, ...rest } = graph;
  return {
    ...rest,
    nodes,
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
  };
}

function count(counts: Map<unknown, number>): number {
  return [...counts.values()].reduce((sum, value) => sum + value, 0);
}

export type RouteCoverage = {
  readonly id: string;
  readonly label: string;
  /** The route path when the graph knows it. */
  readonly path?: string;
  readonly location?: string;
  /** Statements of the slice nodes whose coverage is known. */
  readonly statements: number;
  readonly covered: number;
  /** Slice nodes with a known coverage, the route included. */
  readonly measuredNodes: number;
  /** Slice nodes without one: the known part is a lower bound of the work. */
  readonly unknownNodes: number;
};

/**
 * Coverage of each route over its code slice: every node that can change what
 * the route renders — the attestation slice relations plus the Effect service
 * requirements, so the code of an Effect service counts for its routes.
 */
export function routeCoverage(graph: DependencyGraph): readonly RouteCoverage[] {
  const index = createSliceIndex(graph, {
    readFile: () => undefined,
    forward: DEPENDENCY_FORWARD,
  });
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.nodes
    .filter((node) => node.kind === 'route')
    .map((route): RouteCoverage => {
      let statements = 0;
      let covered = 0;
      let measuredNodes = 0;
      let unknownNodes = 0;
      for (const id of closureOf(index, route.id)) {
        const coverage = nodesById.get(id)?.metrics?.coverage;
        if (!coverage) {
          unknownNodes += 1;
          continue;
        }
        measuredNodes += 1;
        statements += coverage.statements;
        covered += coverage.covered;
      }
      const path = route.details?.['path'];
      const file = relativeGraphPath(graph, route.filePath);
      return {
        id: route.id,
        label: route.label,
        ...(typeof path === 'string' ? { path } : {}),
        ...(file === undefined
          ? {}
          : { location: route.line === undefined ? file : `${file}:${route.line}` }),
        statements,
        covered,
        measuredNodes,
        unknownNodes,
      };
    })
    .sort(
      (left, right) =>
        (left.path ?? left.label).localeCompare(right.path ?? right.label) ||
        left.id.localeCompare(right.id),
    );
}
