/**
 * The behaviour catalog, its ratchet and the mock-boundary rule, run on
 * literal graphs. That the graph marks a query called through its `method`
 * is covered at the end, on a real analysis.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type {
  DependencyGraph,
  DependencyGraphEdge,
  DependencyGraphNode,
} from './dependency-graph.ts';
import { analyzeDependencyGraph } from './dependency-graph.ts';
import {
  behaviorCatalogToTypeScript,
  behaviorObligationsReport,
  behaviorRatchet,
  behaviorTestMocks,
  buildBehaviorCatalog,
  diffBehaviorCatalogs,
  findBehaviorTestFiles,
  parseBehaviorCatalogSource,
  readBehaviorCatalogAtBase,
  type BehaviorCatalog,
} from './behavior-catalog.ts';

// Created at load time: the literal graphs below are built from it.
const rootDir = mkdtempSync(join(tmpdir(), 'craft-behavior-catalog-'));
afterAll(() => rmSync(rootDir, { recursive: true, force: true }));

const app = (file: string) => join(rootDir, 'app', 'src', file);
const lib = (file: string) => join(rootDir, 'libs', 'ui', file);

const node = (
  id: string,
  kind: DependencyGraphNode['kind'],
  label: string,
  filePath: string,
  details: Record<string, unknown> = {},
  line = 3,
): DependencyGraphNode => ({ id, kind, label, filePath, line, details });

const primitive = (
  primitiveKind: string,
  name: string,
  owner: string,
  filePath: string,
  details: Record<string, unknown> = {},
) =>
  node(`primitive:${owner}/${name}`, 'primitive', `${primitiveKind}:${name}`, filePath, {
    primitive: primitiveKind,
    name,
    ownerId: `service:${owner}`,
    ...details,
  });

const graphOf = (
  nodes: DependencyGraphNode[],
  edges: DependencyGraphEdge[] = [],
): DependencyGraph =>
  ({
    version: 1,
    rootDir,
    tsConfigFilePath: join(rootDir, 'tsconfig.json'),
    nodes,
    edges,
    diagnostics: [],
  }) as unknown as DependencyGraph;

const calls = (from: string, to: string): DependencyGraphEdge => ({
  from,
  to,
  kind: 'calls',
  evidence: 'ast',
});
const contains = (from: string, to: string): DependencyGraphEdge => ({
  from,
  to,
  kind: 'contains',
  evidence: 'ast',
});

const shop = graphOf(
  [
    node('service:cart', 'service', 'cart', app('cart.ts')),
    node('service:theme', 'service', 'theme', lib('theme.ts')),
    primitive('mutation', 'addLine', 'cart', app('cart.ts')),
    primitive('craftMethod', 'empty', 'cart', app('cart.ts')),
    primitive('query', 'lines', 'cart', app('cart.ts')),
    primitive('query', 'checkout', 'cart', app('cart.ts'), {
      triggeredByMethod: true,
    }),
    primitive('craftComputed', 'total', 'cart', app('cart.ts')),
    primitive('craftStateMachine', 'payment', 'cart', app('cart.ts')),
    primitive('asyncProcess', 'poll', 'cart', app('cart.ts')),
    primitive('mutation', 'toggle', 'theme', lib('theme.ts')),
    node('route:shop:cart', 'route', 'shop:cart', app('app.routes.ts'), {
      path: 'cart',
      hasComponent: true,
    }),
    node('route:shop:', 'route', 'shop:', app('app.routes.ts'), {
      path: '',
      hasComponent: false,
    }),
    node(
      'route-hook:shop:cart:canActivate',
      'route-hook',
      'shop:cart.canActivate',
      app('app.routes.ts'),
    ),
    node(
      'route-hook:shop:cart:queryParams',
      'route-hook',
      'shop:cart.queryParams',
      app('app.routes.ts'),
    ),
    node(
      'server-function-family:checkout',
      'server-function-family',
      'shop.checkout',
      app('server/functions.ts'),
      { serverFunctionId: 'shop.checkout' },
    ),
    node(
      'http-endpoint:GET:/api/lines',
      'http-endpoint',
      'GET /api/lines',
      app('cart.ts'),
      {
        method: 'GET',
        url: '/api/lines',
        exceptions: ['NotFound', 'Forbidden'],
        callSites: [{ filePath: 'app/src/cart.ts', line: 9 }],
      },
    ),
    node(
      'http-endpoint:GET:/api/theme',
      'http-endpoint',
      'GET /api/theme',
      lib('theme.ts'),
      {
        method: 'GET',
        url: '/api/theme',
        exceptions: ['Offline'],
        callSites: [{ filePath: 'libs/ui/theme.ts', line: 9 }],
      },
    ),
  ],
  [
    contains('service:cart', 'primitive:cart/lines'),
    calls('primitive:cart/lines', 'http-endpoint:GET:/api/lines'),
  ],
);

const sourceRoots = ['app/src'];

describe('buildBehaviorCatalog', () => {
  it('owes a test for what a user triggers × each typed outcome, in the app only', () => {
    const { catalog, problems } = buildBehaviorCatalog(shop, { sourceRoots });
    expect(problems).toEqual([]);
    expect(catalog.behaviors.map((entry) => entry.id)).toEqual([
      'async-process:cart.poll#success',
      'command:cart.checkout#success',
      'guard:shop:cart.canActivate',
      'http-exception:GET /api/lines#Forbidden',
      'http-exception:GET /api/lines#NotFound',
      'method:cart.empty',
      'mutation:cart.addLine#success',
      'route:shop:cart',
      'server-function:shop.checkout',
      'state-machine:cart.payment',
    ]);
  });

  it('builds ids on names: moving a file keeps them, the file is metadata', () => {
    const moved = graphOf(
      shop.nodes.map((entry) =>
        entry.id === 'primitive:cart/addLine'
          ? { ...entry, filePath: app('cart/actions.ts'), line: 80 }
          : entry,
      ),
      shop.edges,
    );
    const before = buildBehaviorCatalog(shop, { sourceRoots }).catalog;
    const after = buildBehaviorCatalog(moved, { sourceRoots }).catalog;
    expect(diffBehaviorCatalogs(before, after)).toMatchObject({
      added: [],
      removed: [],
    });
    expect(
      after.behaviors.find((entry) => entry.id === 'mutation:cart.addLine#success'),
    ).toEqual({
      id: 'mutation:cart.addLine#success',
      kind: 'mutation',
      file: 'app/src/cart/actions.ts',
    });
  });

  it('is deterministic whatever the order the graph lists its nodes in', () => {
    const reversed = graphOf([...shop.nodes].reverse(), shop.edges);
    expect(
      behaviorCatalogToTypeScript(buildBehaviorCatalog(reversed, { sourceRoots }).catalog),
    ).toBe(behaviorCatalogToTypeScript(buildBehaviorCatalog(shop, { sourceRoots }).catalog));
  });

  it('refuses to guess an HTTP call it cannot read, until a contract names it', () => {
    const graph = graphOf([
      node(
        'http-endpoint:POST:<unresolved>',
        'http-endpoint',
        'POST <unresolved>',
        app('orders.ts'),
        {
          method: 'POST',
          url: '<unresolved:orders.ts:12>',
          unresolved: 'dynamic URL requires an explicit HTTP contract',
          callSites: [{ filePath: 'app/src/orders.ts', line: 12 }],
        },
        12,
      ),
    ]);
    expect(buildBehaviorCatalog(graph, { sourceRoots }).problems).toEqual([
      expect.objectContaining({ kind: 'unresolved-http' }),
    ]);
    const declared = buildBehaviorCatalog(graph, {
      sourceRoots,
      httpContracts: {
        'app/src/orders.ts:12': {
          method: 'post',
          url: '/api/orders/:id',
          exceptions: ['Conflict'],
        },
      },
    });
    expect(declared.problems).toEqual([]);
    expect(declared.catalog.behaviors.map((entry) => entry.id)).toEqual([
      'http-exception:POST /api/orders/:id#Conflict',
    ]);
  });

  it('keys the contract by the primitive that calls, so that editing the file keeps it', () => {
    const graph = graphOf([
      primitive('query', 'place', 'orders', app('orders.ts')),
      node(
        'http-endpoint:POST:<unresolved>',
        'http-endpoint',
        'POST <unresolved>',
        app('orders.ts'),
        {
          method: 'POST',
          url: '<unresolved:orders.ts:40>',
          unresolved: 'dynamic URL requires an explicit HTTP contract',
          callSites: [{ ownerId: 'primitive:orders/place', filePath: 'app/src/orders.ts', line: 40 }],
        },
        40,
      ),
    ]);
    expect(buildBehaviorCatalog(graph, { sourceRoots }).problems).toEqual([
      expect.objectContaining({ message: expect.stringContaining("httpContracts['app/src/orders.ts#place']") }),
    ]);
    expect(
      buildBehaviorCatalog(graph, {
        sourceRoots,
        httpContracts: {
          'app/src/orders.ts#place': { method: 'POST', url: '/api/orders', exceptions: [] },
        },
      }).problems,
    ).toEqual([]);
  });

  it('reports two owners with the same name instead of merging them', () => {
    const graph = graphOf([
      primitive('craftMethod', 'open', 'menu', app('a/menu.ts')),
      { ...primitive('craftMethod', 'open', 'menu', app('b/menu.ts')), id: 'other' },
    ]);
    expect(buildBehaviorCatalog(graph, { sourceRoots }).problems).toEqual([
      expect.objectContaining({ kind: 'duplicate-behavior' }),
    ]);
  });

  it('takes the behaviours no primitive expresses, with their reason', () => {
    const { catalog, problems } = buildBehaviorCatalog(graphOf([]), {
      sourceRoots,
      declared: [
        { id: 'pricing.bulk-discount', reason: 'pure function', file: 'app/src/pricing.ts' },
        { id: 'empty-reason', reason: ' ' },
      ],
    });
    expect(catalog.behaviors).toEqual([
      { id: 'declared:pricing.bulk-discount', kind: 'declared', file: 'app/src/pricing.ts' },
    ]);
    expect(problems).toEqual([expect.objectContaining({ kind: 'invalid-declared' })]);
  });

  it('reads back the TypeScript it writes', () => {
    const { catalog } = buildBehaviorCatalog(shop, { sourceRoots });
    expect(parseBehaviorCatalogSource(behaviorCatalogToTypeScript(catalog))).toEqual(
      catalog,
    );
    expect(parseBehaviorCatalogSource('export const x = 1;')).toBeUndefined();
  });
});

describe('behaviorRatchet', () => {
  const catalog = (...ids: string[]): BehaviorCatalog => ({
    version: 1,
    behaviors: ids.map((id) => ({ id, kind: 'method' as const })),
  });

  it('lets a feature go, and asks a new obligation for its proof', () => {
    const report = behaviorRatchet({
      base: catalog('method:a.keep', 'method:a.gone'),
      next: catalog('method:a.keep', 'method:a.new'),
    });
    expect(report.diff).toEqual({
      added: ['method:a.new'],
      removed: ['method:a.gone'],
      kept: ['method:a.keep'],
    });
    expect(report.unproven).toEqual(['method:a.new']);
  });

  it('accepts a proof or a reasoned waiver for a new obligation', () => {
    const base = catalog();
    const next = catalog('method:a.proven', 'method:a.waived');
    expect(
      behaviorRatchet({
        base,
        next,
        proven: new Set(['method:a.proven']),
        waivers: [
          { rule: 'behavior-unproven', target: 'method:a.waived', reason: 'spike' },
        ],
      }),
    ).toMatchObject({ unproven: [], waiverProblems: [] });
  });

  it('keeps the waiver list honest: empty reason, gone obligation, proven one', () => {
    const report = behaviorRatchet({
      base: catalog(),
      next: catalog('method:a.proven', 'method:a.new'),
      proven: new Set(['method:a.proven']),
      waivers: [
        { rule: 'behavior-unproven', target: 'method:a.new', reason: '' },
        { rule: 'behavior-unproven', target: 'method:a.gone', reason: 'old' },
        { rule: 'behavior-unproven', target: 'method:a.proven', reason: 'old' },
      ],
    });
    expect(report.unproven).toEqual(['method:a.new']);
    expect(report.waiverProblems).toEqual([
      expect.stringContaining('the reason is empty'),
      expect.stringContaining('the obligation is gone'),
      expect.stringContaining('a test proves it now'),
    ]);
  });

  it('does not run without a base catalog, and a waiver stays valid across the merge', () => {
    const next = catalog('method:a.new');
    const waivers = [
      { rule: 'behavior-unproven' as const, target: 'method:a.new', reason: 'spike' },
    ];
    expect(behaviorRatchet({ base: undefined, next, waivers })).toEqual({
      baseline: 'missing',
      unproven: [],
      lost: [],
      waiverProblems: [],
    });
    // Once merged, the obligation exists on the base: the waiver still names a
    // gap, so it is not stale.
    expect(behaviorRatchet({ base: next, next, waivers }).waiverProblems).toEqual([]);
  });
});

describe('readBehaviorCatalogAtBase', () => {
  it('reads the catalog where the branch left the base, and nothing when the base has none', () => {
    const repo = mkdtempSync(join(tmpdir(), 'craft-behavior-git-'));
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
    try {
      git('init', '-q', '-b', 'main');
      git('config', 'user.email', 'test@example.com');
      git('config', 'user.name', 'test');
      mkdirSync(join(repo, 'app', 'architecture'), { recursive: true });
      writeFileSync(join(repo, 'README.md'), '');
      git('add', '.');
      git('commit', '-q', '-m', 'start');
      const options = {
        rootDir: join(repo, 'app'),
        catalogPath: 'architecture/behaviors.catalog.ts',
        baseRef: 'main',
      };
      expect(readBehaviorCatalogAtBase(options)).toBeUndefined();

      const onMain: BehaviorCatalog = {
        version: 1,
        behaviors: [{ id: 'method:a.keep', kind: 'method' }],
      };
      writeFileSync(join(repo, 'app', options.catalogPath), behaviorCatalogToTypeScript(onMain));
      git('add', '.');
      git('commit', '-q', '-m', 'catalog');
      git('checkout', '-q', '-b', 'feature');
      writeFileSync(
        join(repo, 'app', options.catalogPath),
        behaviorCatalogToTypeScript({
          version: 1,
          behaviors: [...onMain.behaviors, { id: 'method:a.new', kind: 'method' }],
        }),
      );
      git('commit', '-q', '-am', 'feature');
      expect(readBehaviorCatalogAtBase(options)).toEqual(onMain);
      expect(readBehaviorCatalogAtBase({ ...options, baseRef: ['nope', 'main'] })).toEqual(onMain);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe('mocks only at the boundaries', () => {
  const spec = (name: string, source: string) => {
    const file = join(rootDir, 'app', 'src', name);
    mkdirSync(join(rootDir, 'app', 'src'), { recursive: true });
    writeFileSync(file, source);
    return `app/src/${name}`;
  };

  const services = graphOf(
    [
      node('service:cartView', 'service', 'cartView', app('cart-view.ts')),
      node('service:cart', 'service', 'cart', app('cart.ts')),
      node('service:clock', 'service', 'clock', app('clock.ts'), {
        browserBoundary: true,
      }),
      node('service:StoragePersister', 'service', 'StoragePersister', lib('storage.ts')),
      primitive('mutation', 'addLine', 'cart', app('cart.ts')),
      node('server-function-family:add', 'server-function-family', 'shop.add', app('server.ts')),
    ],
    [
      contains('service:cart', 'primitive:cart/addLine'),
      calls('primitive:cart/addLine', 'server-function-family:add'),
    ],
  );

  it('reads the register maps: strings and provideX() keep the real service', () => {
    const file = spec(
      'register.spec.ts',
      `
      setupCraftServiceTestingByRegister(CartView, {
        cartView: provideCartView(),
        cart: { addLine: vi.fn() },
        token: 'notReached',
      });
      setupCraftServiceTest(Cart, { cartView, clock: { now: () => 0 } });
      `,
    );
    expect(behaviorTestMocks(rootDir, [file]).map((mock) => mock.key)).toEqual([
      'cart',
      'cartView',
      'clock',
    ]);
  });

  it('lets a template test render the view it is given', () => {
    const file = spec(
      'template.spec.ts',
      `
      setupCraftComponentTemplateTest.byRegister(Cart, {
        inputs: {},
        register: { cartView: { lines: () => [] }, cart: 'notReached' },
      });
      `,
    );
    expect(behaviorTestMocks(rootDir, [file])).toEqual([]);
  });

  it('refuses a mock of the app’s own service, accepts boundaries and unknown keys', () => {
    const file = spec(
      'boundaries.spec.ts',
      `
      setupCraftServiceTest(CartView, {
        cart: { addLine: vi.fn() },
        clock: { now: () => 0 },
        StoragePersister: {},
        UserIdPathParams: {},
      });
      setupCraftServiceTest(Cart, { cartView: { lines: () => [] } });
      `,
    );
    const report = behaviorObligationsReport(services, {
      sourceRoots,
      base: undefined,
      testFiles: [file],
    });
    expect(report.violations).toEqual([
      expect.stringContaining("'cartView' is mocked, but it is the app's own code"),
    ]);
    const waived = behaviorObligationsReport(services, {
      sourceRoots,
      base: undefined,
      testFiles: [file],
      waivers: [
        {
          rule: 'behavior-test-mocks-boundaries',
          target: `${file}:cartView`,
          reason: 'the cart reads a fixed list in this test',
        },
        {
          rule: 'behavior-test-mocks-boundaries',
          target: `${file}:cart`,
          reason: 'cart is a boundary already',
        },
      ],
    });
    expect(waived.violations).toEqual([expect.stringContaining('is stale')]);
  });

  it('finds the spec files, skipping dependencies and recorded sessions', () => {
    spec('found.test.ts', '');
    mkdirSync(join(rootDir, 'app', 'src', 'node_modules'), { recursive: true });
    writeFileSync(join(rootDir, 'app', 'src', 'node_modules', 'x.spec.ts'), '');
    expect(findBehaviorTestFiles(rootDir, ['app'])).toEqual(
      expect.arrayContaining(['app/src/found.test.ts']),
    );
    expect(findBehaviorTestFiles(rootDir, ['app'])).not.toContain(
      'app/src/node_modules/x.spec.ts',
    );
  });
});

describe('a query called through its method', () => {
  it('is marked by the graph, so the catalog owes it a test', () => {
    const dir = mkdtempSync(join(tmpdir(), 'craft-behavior-graph-'));
    try {
      writeFileSync(
        join(dir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { strict: true }, files: ['orders.ts'] }),
      );
      writeFileSync(
        join(dir, 'orders.ts'),
        `
        declare function craftService(...args: unknown[]): Record<string, unknown>;
        declare function query(...args: unknown[]): unknown;
        export const { orders } = craftService({ name: 'orders', providedIn: 'global' }, function* () {
          const list = yield* query('list', { loader: function* () { return []; } });
          const place = yield* query('place', {
            method: (id: string) => id,
            loader: function* ({ params }) { return params; },
          });
          return { list, place };
        });
        `,
      );
      const graph = analyzeDependencyGraph({ rootDir: dir, tsConfigFilePath: 'tsconfig.json' });
      const queries = graph.nodes.filter((entry) => entry.details?.['primitive'] === 'query');
      expect(
        Object.fromEntries(
          queries.map((entry) => [entry.details?.['name'], entry.details?.['triggeredByMethod'] ?? false]),
        ),
      ).toEqual({ list: false, place: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
