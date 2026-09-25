import { describe, expect, it } from 'vitest';
import type {
  DependencyGraph,
  DependencyGraphEdge,
  DependencyGraphNode,
} from './dependency-graph';
import { churnFromGitLog } from './graph-metrics';
import { formatGraphReportMarkdown, graphReport } from './graph-report';

const root = '/repo';

function node(
  id: string,
  kind: DependencyGraphNode['kind'],
  label: string,
  file: string,
  extra: Partial<DependencyGraphNode> = {},
): DependencyGraphNode {
  return {
    id: `${kind}:${root}/${file}:${label}`,
    kind,
    label,
    filePath: `${root}/${file}`,
    line: 1,
    ...extra,
  } satisfies DependencyGraphNode & { id: string };
}

const panel = node('', 'component', 'Panel', 'src/features/cart/panel.ts', {
  metrics: { cyclomaticOwn: 4, cyclomaticTotal: 6, lines: 30, fanIn: 0, fanOut: 1 },
});
const cart = node('', 'service', 'CartService', 'src/features/cart/cart.service.ts', {
  line: 3,
  metrics: { cyclomaticOwn: 3, cyclomaticTotal: 3, lines: 12, fanIn: 2, fanOut: 1 },
});
const user = node('', 'service', 'UserService', 'src/features/user/user.service.ts', {
  metrics: { cyclomaticOwn: 2, cyclomaticTotal: 2, lines: 8, fanIn: 1, fanOut: 1 },
});
const items = node('', 'primitive', 'state:items', 'src/features/cart/cart.service.ts', {
  line: 5,
  metrics: { cyclomaticOwn: 1, cyclomaticTotal: 1, lines: 1, fanIn: 0, fanOut: 0 },
});
const reset = node('', 'property', 'CartService.items.reset', 'src/features/cart/cart.service.ts', {
  line: 6,
  details: { exposedMethod: true, member: 'reset' },
  metrics: { fanIn: 0, fanOut: 0 },
});

function edge(
  from: DependencyGraphNode,
  kind: DependencyGraphEdge['kind'],
  to: DependencyGraphNode,
): DependencyGraphEdge {
  return { from: from.id, to: to.id, kind, evidence: 'type' };
}

const graph: DependencyGraph = {
  version: 1,
  rootDir: root,
  tsConfigFilePath: `${process.cwd()}/tests/fixtures/empty-tsconfig.json`,
  nodes: [panel, cart, user, items, reset],
  edges: [
    edge(panel, 'depends-on', cart),
    edge(cart, 'depends-on', user),
    edge(user, 'depends-on', cart),
    edge(cart, 'contains', items),
    edge(items, 'contains', reset),
  ],
  diagnostics: [
    { code: 'CRAFT_GRAPH_METRICS_UNKNOWN', message: '1 property node…' },
    { code: 'OTHER', message: 'a' },
    { code: 'OTHER', message: 'b' },
  ],
};

describe('graphReport', () => {
  const options = {
    featureGlob: 'src/features/:feature/**',
    churn: new Map([[`${root}/src/features/cart/panel.ts`, 2]]),
  };

  it('summarises the graph with portable ids and locations', () => {
    const report = graphReport(graph, options);

    expect(report.summary).toEqual({
      nodes: 5,
      edges: 5,
      nodesByKind: { component: 1, primitive: 1, property: 1, service: 2 },
      edgesByKind: { contains: 2, 'depends-on': 3 },
      diagnostics: { CRAFT_GRAPH_METRICS_UNKNOWN: 1, OTHER: 2 },
    });
    expect(report.godNodes.map((entry) => [entry.label, entry.fanIn])).toEqual([
      ['CartService', 2],
      ['UserService', 1],
    ]);
    expect(report.godNodes[0]).toMatchObject({
      id: 'service:src/features/cart/cart.service.ts:CartService',
      location: 'src/features/cart/cart.service.ts:3',
    });
    expect(
      report.hotspots.entries.slice(0, 3).map((entry) => [entry.label, entry.score]),
    ).toEqual([
      ['Panel', 6 * 1 * 3],
      ['CartService', 3 * 3],
      ['UserService', 2 * 2],
    ]);
    expect(report.hotspots.churnMeasured).toBe(true);
  });

  it('lists cycles, unused methods, cross-feature relations and violations', () => {
    const report = graphReport(graph, options);

    expect(report.cycles).toEqual([
      {
        ids: [
          'service:src/features/cart/cart.service.ts:CartService',
          'service:src/features/user/user.service.ts:UserService',
          'service:src/features/cart/cart.service.ts:CartService',
        ].slice(0, report.cycles[0]?.ids.length),
        labels: expect.arrayContaining(['CartService', 'UserService']),
      },
    ]);
    expect(report.unusedMethods).toEqual([
      {
        primitive: 'state:items',
        method: 'reset',
        location: 'src/features/cart/cart.service.ts:6',
      },
    ]);
    expect(report.featureEdges).toEqual([
      { from: 'cart', to: 'user', edges: 1, kinds: ['depends-on'] },
      { from: 'user', to: 'cart', edges: 1, kinds: ['depends-on'] },
    ]);
    expect(report.violations.map((violation) => violation.rule)).toEqual(
      expect.arrayContaining(['no-unused-primitive-methods', 'no-dependency-cycles']),
    );
  });

  it('does not depend on discovery order', () => {
    const shuffled: DependencyGraph = {
      ...graph,
      nodes: [...graph.nodes].reverse(),
      edges: [...graph.edges].reverse(),
      diagnostics: [...(graph.diagnostics ?? [])].reverse(),
    };

    expect(graphReport(shuffled, options)).toEqual(graphReport(graph, options));
  });

  it('says when churn was not measured and omits features without a glob', () => {
    const report = graphReport(graph);

    expect(report.hotspots.churnMeasured).toBe(false);
    expect(report.featureEdges).toBeUndefined();
    expect(formatGraphReportMarkdown(report)).toContain('Churn was not measured');
  });

  it('renders Markdown', () => {
    expect(formatGraphReportMarkdown(graphReport(graph, options))).toMatchSnapshot();
  });
});

describe('churnFromGitLog', () => {
  it('counts commits per absolute file path', () => {
    const churn = churnFromGitLog(
      'src/a.ts\nsrc/b.ts\n\nsrc/a.ts\n',
      '/repo/',
    );

    expect([...churn]).toEqual([
      ['/repo/src/a.ts', 2],
      ['/repo/src/b.ts', 1],
    ]);
  });
});
