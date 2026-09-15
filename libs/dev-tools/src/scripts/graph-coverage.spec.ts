import { describe, expect, it } from 'vitest';
import type {
  DependencyGraph,
  DependencyGraphEdge,
  DependencyGraphNode,
} from './dependency-graph';
import {
  applyCoverage,
  COVERAGE_UNKNOWN_DIAGNOSTIC,
  routeCoverage,
  type IstanbulCoverageMap,
} from './graph-coverage';
import { formatGraphReportMarkdown, graphReport } from './graph-report';

const node = (
  id: string,
  kind: DependencyGraphNode['kind'],
  file: string | undefined,
  line?: number,
  endLine?: number,
  extra: Partial<DependencyGraphNode> = {},
): DependencyGraphNode => ({
  id,
  kind,
  label: id,
  ...(file ? { filePath: `/repo/src/${file}` } : {}),
  ...(line === undefined ? {} : { line }),
  ...(endLine === undefined ? {} : { endLine }),
  ...extra,
});

const edge = (
  from: string,
  kind: DependencyGraphEdge['kind'],
  to: string,
): DependencyGraphEdge => ({ from, to, kind, evidence: 'ast' });

const graph: DependencyGraph = {
  version: 1,
  rootDir: '/repo',
  tsConfigFilePath: '/repo/tsconfig.json',
  nodes: [
    node('home', 'route', 'routes.ts', 3, 3, { details: { path: 'home' } }),
    node('Page', 'component', 'page.ts', 1, 20),
    node('items', 'primitive', 'page.ts', 5, 10),
    node('Api', 'service', 'api.ts', 1, 8),
    node('identity', 'unique', 'page.ts', 6),
    node('Other', 'component', 'other.ts', 1, 5),
  ],
  edges: [
    edge('home', 'loads', 'Page'),
    edge('Page', 'contains', 'items'),
    edge('Page', 'depends-on', 'Api'),
    edge('Page', 'depends-on', 'identity'),
  ],
  diagnostics: [{ code: 'KEEP', message: 'unrelated' }],
};

const statement = (line: number) => ({
  start: { line, column: 0 },
  end: { line, column: 10 },
});

const coverage: IstanbulCoverageMap = {
  '/repo/src/page.ts': {
    statementMap: { 0: statement(2), 1: statement(6), 2: statement(7), 3: statement(25) },
    s: { 0: 1, 1: 0, 2: 3, 3: 1 },
  },
  // Relative keys are resolved against the graph root.
  'src/api.ts': { statementMap: { 0: statement(2) }, s: { 0: 0 } },
  '/repo/src/routes.ts': { statementMap: { 0: statement(3) }, s: { 0: 2 } },
};

describe('applyCoverage', () => {
  it('credits each statement to the innermost node and leaves unknown nodes unmeasured', () => {
    const applied = applyCoverage(graph, coverage);
    const byId = new Map(applied.nodes.map((entry) => [entry.id, entry]));

    expect(byId.get('items')?.metrics?.coverage).toEqual({ statements: 2, covered: 1 });
    expect(byId.get('Page')?.metrics?.coverage).toEqual({ statements: 1, covered: 1 });
    expect(byId.get('Api')?.metrics?.coverage).toEqual({ statements: 1, covered: 0 });
    expect(byId.get('home')?.metrics?.coverage).toEqual({ statements: 1, covered: 1 });
    expect(byId.get('identity')?.metrics?.coverage).toBeUndefined();
    expect(byId.get('Other')?.metrics?.coverage).toBeUndefined();
    expect(byId.get('Other')?.metrics).toEqual({ fanIn: 0, fanOut: 0 });

    expect(applied.diagnostics).toEqual([
      { code: 'KEEP', message: 'unrelated' },
      {
        code: COVERAGE_UNKNOWN_DIAGNOSTIC,
        message: '1 unique node has no line range: coverage is unknown, not 0 %.',
      },
      {
        code: COVERAGE_UNKNOWN_DIAGNOSTIC,
        message:
          '1 component node in files absent from the coverage report: coverage is unknown, not 0 %.',
      },
    ]);
    expect(graph.nodes[1]?.metrics).toBeUndefined();
  });

  it('replaces a previous report instead of adding to it', () => {
    const twice = applyCoverage(applyCoverage(graph, coverage), coverage);

    expect(twice).toEqual(applyCoverage(graph, coverage));
  });
});

describe('routeCoverage', () => {
  it('sums the slice without counting a statement twice and counts unknown nodes', () => {
    expect(routeCoverage(applyCoverage(graph, coverage))).toEqual([
      {
        id: 'home',
        label: 'home',
        path: 'home',
        location: 'src/routes.ts:3',
        statements: 5,
        covered: 3,
        measuredNodes: 4,
        unknownNodes: 1,
      },
    ]);
  });

  it('appears in the report only once coverage is applied', () => {
    expect(graphReport(graph).routeCoverage).toBeUndefined();

    const report = graphReport(applyCoverage(graph, coverage));
    expect(report.routeCoverage?.[0]).toMatchObject({ covered: 3, statements: 5 });
    expect(formatGraphReportMarkdown(report)).toContain(
      '| home | 3 / 5 | 60 % | 1 | src/routes.ts:3 |',
    );
  });
});
