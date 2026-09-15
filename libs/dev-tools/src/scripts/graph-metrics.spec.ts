import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Project } from 'ts-morph';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertMetricThresholds,
  graphHash,
  metricThresholdViolations,
} from './architecture-graph';
import {
  analyzeDependencyGraph,
  type DependencyGraph,
  type DependencyGraphEdge,
  type DependencyGraphNode,
} from './dependency-graph';
import {
  attachNodeMetrics,
  couplingDegrees,
  cyclomaticDecisionPoints,
  godNodes,
  graphHotspots,
  METRICS_UNKNOWN_DIAGNOSTIC,
  type NodeSourceSpan,
} from './graph-metrics';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'craft-graph-metrics-'));
  temporaryDirectories.push(root);
  await writeFile(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        strict: true,
        skipLibCheck: true,
      },
      include: ['./**/*.ts'],
    }),
    'utf8',
  );
  await Promise.all(
    Object.entries(files).map(([path, contents]) =>
      writeFile(join(root, path), contents, 'utf8'),
    ),
  );
  return root;
}

const CRAFT_STUBS = `
declare function craftComponent(...args: unknown[]): unknown;
declare function state(...args: unknown[]): unknown;
declare function craftComputed(...args: unknown[]): unknown;
declare function div(...args: unknown[]): unknown;
declare function span(...args: unknown[]): unknown;
declare const flags: { mode?: string };
`;

function node(
  id: string,
  extra: Partial<DependencyGraphNode> = {},
): DependencyGraphNode {
  return { id, kind: 'primitive', label: id, ...extra };
}

function edge(
  from: string,
  kind: DependencyGraphEdge['kind'],
  to: string,
): DependencyGraphEdge {
  return { from, to, kind, evidence: 'ast' };
}

function graphOf(
  nodes: DependencyGraphNode[],
  edges: DependencyGraphEdge[],
): DependencyGraph {
  return { version: 1, rootDir: '/', tsConfigFilePath: '/tsconfig.json', nodes, edges };
}

function span(start: number, end: number, filePath = '/a.ts'): NodeSourceSpan {
  return { filePath, start, end, startLine: 1, endLine: 3 };
}

describe('cyclomaticDecisionPoints', () => {
  it('counts every kind of decision point and nothing else', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const file = project.createSourceFile(
      'kinds.ts',
      `
      declare const a: boolean, b: boolean, n: number | undefined;
      declare const xs: number[], o: Record<string, number>;
      export function everything() {
        if (a) {}
        const t = a ? 1 : 2;
        switch (t) { case 1: break; case 2: break; default: break; }
        for (let i = 0; i < 1; i++) {}
        for (const x of xs) {}
        for (const k in o) {}
        while (b) {}
        do {} while (b);
        try {} catch {}
        const l = (a && b) || a;
        const m = n ?? 0;
        const plain = t + 1 === 2 && typeof l === 'boolean';
        return [m, plain];
      }
      `,
    );

    // if, ?:, 2 × case, for, for…of, for…in, while, do, catch, &&, ||, ??, &&
    expect(cyclomaticDecisionPoints(file)).toHaveLength(14);
  });

  it('gives each operator of a chain its own position', () => {
    const project = new Project({ useInMemoryFileSystem: true });
    const file = project.createSourceFile(
      'chain.ts',
      'declare const a: boolean, b: boolean, c: boolean;\nexport const x = a && b && c;\n',
    );

    const points = cyclomaticDecisionPoints(file);
    expect(points).toHaveLength(2);
    expect(new Set(points).size).toBe(2);
  });
});

describe('couplingDegrees', () => {
  it('counts distinct neighbours, ignoring contains and self-loops', () => {
    const degrees = couplingDegrees(
      graphOf(
        [node('a'), node('b'), node('c')],
        [
          edge('a', 'depends-on', 'b'),
          edge('a', 'calls', 'b'),
          edge('c', 'reads', 'b'),
          edge('a', 'contains', 'c'),
          edge('b', 'writes', 'b'),
          edge('c', 'checks', 'a'),
        ],
      ),
    );

    expect(degrees.get('a')).toEqual({ fanIn: 0, fanOut: 1 });
    expect(degrees.get('b')).toEqual({ fanIn: 2, fanOut: 0 });
    expect(degrees.get('c')).toEqual({ fanIn: 0, fanOut: 1 });
  });

  it('counts Effect service requirements and layers as coupling', () => {
    const degrees = couplingDegrees(
      graphOf(
        [node('query'), node('Store'), node('StoreLive')],
        [
          edge('query', 'requires-service', 'Store'),
          edge('Store', 'provided-by-layer', 'StoreLive'),
        ],
      ),
    );

    expect(degrees.get('Store')).toEqual({ fanIn: 1, fanOut: 1 });
  });
});

describe('attachNodeMetrics', () => {
  it('credits each decision point to the innermost node', () => {
    const graph = graphOf(
      [node('parent'), node('child'), node('orphan', { kind: 'unique' })],
      [edge('parent', 'contains', 'child'), edge('parent', 'reads', 'orphan')],
    );
    const spans = new Map([
      ['parent', span(0, 100)],
      ['child', span(10, 20)],
    ]);

    const diagnostics = attachNodeMetrics(graph, spans, () => [5, 15, 15, 50]);
    const byId = new Map(graph.nodes.map((entry) => [entry.id, entry]));

    expect(byId.get('child')?.metrics).toMatchObject({
      cyclomaticOwn: 3,
      cyclomaticTotal: 3,
    });
    expect(byId.get('parent')?.metrics).toMatchObject({
      cyclomaticOwn: 3,
      cyclomaticTotal: 5,
      lines: 3,
      fanOut: 1,
    });
    expect(byId.get('orphan')?.metrics).toEqual({ fanIn: 1, fanOut: 0 });
    expect(diagnostics).toEqual([
      {
        code: METRICS_UNKNOWN_DIAGNOSTIC,
        message: expect.stringContaining('1 unique node has no source range'),
      },
    ]);
  });

  it('breaks a tie between identical ranges with the contains tree', () => {
    const graph = graphOf(
      [node('outer'), node('inner')],
      [edge('outer', 'contains', 'inner')],
    );
    const spans = new Map([
      ['outer', span(0, 10)],
      ['inner', span(0, 10)],
    ]);

    attachNodeMetrics(graph, spans, () => [3]);

    const inner = graph.nodes.find((entry) => entry.id === 'inner');
    const outer = graph.nodes.find((entry) => entry.id === 'outer');
    expect(inner?.metrics?.cyclomaticOwn).toBe(2);
    expect(outer?.metrics?.cyclomaticOwn).toBe(1);
    expect(outer?.metrics?.cyclomaticTotal).toBe(2);
  });
});

describe('analyzeDependencyGraph metrics', () => {
  it('attributes a primitive nested in a component to the primitive', async () => {
    const root = await fixture({
      'panel.ts': `
        ${CRAFT_STUBS}

        const Panel = craftComponent(
          'Panel',
          {},
          function* () {
            const filter = yield* state('filter', 'all');
            const visible = craftComputed('visible', function* () {
              const value = (yield* filter()) as string;
              if (value === 'all') return true;
              return value === 'none' ? false : value.length > 0 && value !== 'x';
            });
            const mode = flags.mode ?? 'compact';
            return { filter, visible, mode };
          },
          () => div([span('static')]),
        );
      `,
    });

    const graph = analyzeDependencyGraph({
      rootDir: root,
      tsConfigFilePath: 'tsconfig.json',
    });
    const byLabel = (label: string) =>
      graph.nodes.find((entry) => entry.label === label);

    const computed = byLabel('craftComputed:visible');
    const component = byLabel('Panel');
    // if, ?:, &&
    expect(computed?.metrics?.cyclomaticOwn).toBe(4);
    // ??
    expect(component?.metrics?.cyclomaticOwn).toBe(2);
    expect(component?.metrics?.cyclomaticTotal).toBe(5);
    expect(component?.metrics?.lines).toBe(
      (component?.endLine ?? 0) - (component?.line ?? 0) + 1,
    );
  });

  it('does not move graphHash', async () => {
    const root = await fixture({
      'panel.ts': `
        ${CRAFT_STUBS}
        const Panel = craftComponent('Panel', {}, function* () {
          const filter = yield* state('filter', 'all');
          return { filter };
        }, () => div([span('x')]));
      `,
    });

    const graph = analyzeDependencyGraph({
      rootDir: root,
      tsConfigFilePath: 'tsconfig.json',
    });
    const withoutMetrics: DependencyGraph = {
      ...graph,
      nodes: graph.nodes.map(({ metrics: _metrics, ...rest }) => rest),
    };

    expect(graph.nodes.every((entry) => entry.metrics !== undefined)).toBe(true);
    expect(graphHash(graph)).toBe(graphHash(withoutMetrics));
  });
});

describe('rankings', () => {
  const ranked = graphOf(
    [
      node('b', { filePath: '/b.ts', metrics: { cyclomaticTotal: 10, fanIn: 1, fanOut: 0 } }),
      node('a', { filePath: '/a.ts', metrics: { cyclomaticTotal: 2, fanIn: 4, fanOut: 0 } }),
      node('c', { filePath: '/c.ts', metrics: { cyclomaticTotal: 3, fanIn: 4, fanOut: 1 } }),
      node('unknown', { metrics: { fanIn: 9, fanOut: 0 } }),
      node('lonely', { metrics: { cyclomaticTotal: 1, fanIn: 0, fanOut: 0 } }),
    ],
    [],
  );

  it('orders god nodes by fan-in, then id, and skips nodes nobody uses', () => {
    expect(godNodes(ranked).map((entry) => entry.id)).toEqual([
      'unknown',
      'a',
      'c',
      'b',
    ]);
    expect(godNodes(ranked, { limit: 2 })).toHaveLength(2);
  });

  it('reports nodes above a threshold, skipping unknown metrics and allowed nodes', () => {
    const graph = graphOf(
      [
        node('/repo/src/a.ts#big', {
          label: 'big',
          filePath: '/repo/src/a.ts',
          line: 4,
          metrics: { cyclomaticOwn: 12, cyclomaticTotal: 30, fanIn: 2, fanOut: 0 },
        }),
        node('/repo/src/legacy/old.ts#old', {
          label: 'old',
          filePath: '/repo/src/legacy/old.ts',
          metrics: { cyclomaticOwn: 50, fanIn: 0, fanOut: 0 },
        }),
        node('/repo/src/b.ts#unmeasured', {
          kind: 'unique',
          label: 'unmeasured',
          filePath: '/repo/src/b.ts',
          metrics: { fanIn: 0, fanOut: 0 },
        }),
      ],
      [],
    );
    graph.rootDir = '/repo';
    const options = {
      max: { cyclomaticOwn: 10, cyclomaticTotal: 40 },
      allow: ['src/legacy/**'],
    };

    expect(metricThresholdViolations(graph, options)).toEqual([
      {
        nodeId: '/repo/src/a.ts#big',
        kind: 'primitive',
        label: 'big',
        filePath: 'src/a.ts',
        line: 4,
        metric: 'cyclomaticOwn',
        value: 12,
        max: 10,
      },
    ]);
    expect(() => assertMetricThresholds(graph, options)).toThrow(
      'Metric threshold: primitive big has cyclomaticOwn 12 > 10 (src/a.ts:4).',
    );
    expect(
      metricThresholdViolations(graph, { ...options, kinds: ['unique'] }),
    ).toEqual([]);
  });

  it('refuses to check a graph that carries no metrics', () => {
    expect(() =>
      assertMetricThresholds(graphOf([node('a')], []), {
        max: { fanIn: 1 },
      }),
    ).toThrow('carries no metrics');
  });

  it('scores hotspots with churn and leaves unknown complexity out', () => {
    const hotspots = graphHotspots(ranked, {
      churn: new Map([['/a.ts', 3]]),
    });

    expect(hotspots.map((entry) => [entry.id, entry.score])).toEqual([
      ['a', 2 * 5 * 4],
      ['b', 10 * 2 * 1],
      ['c', 3 * 5 * 1],
      ['lonely', 1],
    ]);
  });
});
