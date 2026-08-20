import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeDependencyGraph } from './dependency-graph';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'craft-dependency-graph-'));
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
declare function craftService(...args: unknown[]): Record<string, (...args: never[]) => unknown>;
declare function craftComponent(...args: unknown[]): unknown;
declare function state(...args: unknown[]): unknown;
declare function query(...args: unknown[]): unknown;
declare function mutation(...args: unknown[]): unknown;
declare function craftUnique<T>(value: T): T;
declare function insertStoragePersister(...args: unknown[]): unknown;
declare function insertReactOnMutation(...args: unknown[]): unknown;
declare function insertQueryPipe(...args: unknown[]): unknown;
declare function insertSelect(...args: unknown[]): unknown;
declare function craftStateMachine(...args: unknown[]): unknown;
declare function transitionStep(...args: unknown[]): unknown;
declare function initStateMachine(...args: unknown[]): unknown;
declare function source$(...args: unknown[]): unknown;
declare function craftEffect(...args: unknown[]): unknown;
declare function craftComputed(...args: unknown[]): unknown;
declare function craftMethod(...args: unknown[]): unknown;
declare function settled(...args: unknown[]): unknown;
declare function div(...args: unknown[]): unknown;
declare function span(...args: unknown[]): unknown;
declare function button(...args: unknown[]): unknown;
declare function ifBlock(...args: unknown[]): unknown;
declare function each(...args: unknown[]): unknown;
`;

function nodeByLabel(
  graph: ReturnType<typeof analyzeDependencyGraph>,
  label: string,
) {
  return graph.nodes.filter((node) => node.label === label);
}

function edgesFrom(
  graph: ReturnType<typeof analyzeDependencyGraph>,
  fromLabel: string,
  kind?: string,
) {
  const fromIds = new Set(
    graph.nodes.filter((node) => node.label === fromLabel).map((node) => node.id),
  );
  return graph.edges.filter(
    (edge) => fromIds.has(edge.from) && (kind === undefined || edge.kind === kind),
  );
}

function edgeLabels(
  graph: ReturnType<typeof analyzeDependencyGraph>,
  fromLabel: string,
  kind?: string,
) {
  return edgesFrom(graph, fromLabel, kind).map((edge) => {
    const target = graph.nodes.find((node) => node.id === edge.to);
    return `${edge.kind}->${target?.label ?? edge.to}`;
  });
}

describe('analyzeDependencyGraph reactive granularity', () => {
  it('resolves yield* state() to the enclosing state when several states exist', async () => {
    const root = await fixture({
      'pixels.ts': `
        ${CRAFT_STUBS}

        const PixelArt = craftComponent(
          'PixelArt',
          {},
          function* () {
            const ui = yield* state('ui', { color: '#000' });
            const cells = yield* state('cells', [], ({ state }) => ({
              paintedCount: craftComputed('paintedCount', function* () {
                return (yield* state()).length;
              }),
            }));
            return { ui, cells };
          },
          ({ ui, cells }) =>
            div([
              span(function* () { return yield* cells.paintedCount(); }),
              span(function* () { return yield* ui(); }),
            ]),
        );
      `,
    });

    const graph = analyzeDependencyGraph({
      rootDir: root,
      tsConfigFilePath: 'tsconfig.json',
    });

    expect(nodeByLabel(graph, 'state:state')).toHaveLength(0);
    expect(edgeLabels(graph, 'craftComputed:paintedCount', 'depends-on')).toContain(
      'depends-on->state:cells',
    );
    expect(edgeLabels(graph, 'craftComputed:paintedCount', 'depends-on')).not.toContain(
      'depends-on->state:ui',
    );
  });

  it('links craftComputed yield* state() to the enclosing state, not a new state primitive', async () => {
    const root = await fixture({
      'counter.ts': `
        ${CRAFT_STUBS}

        const { Counter } = craftService(
          { name: 'Counter', providedIn: 'function' },
          function* () {
            const count = yield* state('count', 0, ({ state, update }) => ({
              doubled: craftComputed('doubled', function* () {
                return (yield* state()) * 2;
              }),
              increment: () => update((value) => value + 1),
            }));
            return { count };
          },
        );
      `,
    });

    const graph = analyzeDependencyGraph({
      rootDir: root,
      tsConfigFilePath: 'tsconfig.json',
    });

    expect(nodeByLabel(graph, 'state:count')).toHaveLength(1);
    expect(nodeByLabel(graph, 'state:state')).toHaveLength(0);
    expect(nodeByLabel(graph, 'craftComputed:doubled')).toHaveLength(1);
    expect(edgeLabels(graph, 'state:count', 'contains')).toContain(
      'contains->craftComputed:doubled',
    );
    expect(edgeLabels(graph, 'craftComputed:doubled', 'depends-on')).toContain(
      'depends-on->state:count',
    );
  });

  it('tracks query resource readers and nested computed-to-computed dependencies', async () => {
    const root = await fixture({
      'search.ts': `
        ${CRAFT_STUBS}

        const { Search } = craftService(
          { name: 'Search', providedIn: 'function' },
          function* () {
            const results = yield* query('results', () => Promise.resolve([]), ({ resource }) => ({
              isLoading: craftComputed('isLoading', function* () {
                return yield* resource.isLoading();
              }),
              hasResults: craftComputed('hasResults', function* () {
                return ((yield* resource.value())?.length ?? 0) > 0;
              }),
            }));
            const showEmpty = craftComputed('showEmpty', function* () {
              return !(yield* results.isLoading()) && !(yield* results.hasResults());
            });
            return { results, showEmpty };
          },
        );
      `,
    });

    const graph = analyzeDependencyGraph({
      rootDir: root,
      tsConfigFilePath: 'tsconfig.json',
    });

    expect(nodeByLabel(graph, 'query:results')).toHaveLength(1);
    expect(edgeLabels(graph, 'craftComputed:isLoading')).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/depends-on->.*isLoading/),
      ]),
    );
    expect(edgeLabels(graph, 'craftComputed:hasResults')).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/depends-on->.*value/),
      ]),
    );
    expect(edgeLabels(graph, 'craftComputed:showEmpty', 'depends-on')).toEqual(
      expect.arrayContaining([
        'depends-on->craftComputed:isLoading',
        'depends-on->craftComputed:hasResults',
      ]),
    );
  });

  it('records template reads of states/computeds and method calls', async () => {
    const root = await fixture({
      'view.ts': `
        ${CRAFT_STUBS}

        const { Counter } = craftService(
          { name: 'Counter', providedIn: 'function' },
          function* () {
            const count = yield* state('count', 0, ({ state, update }) => ({
              doubled: craftComputed('doubled', function* () {
                return (yield* state()) * 2;
              }),
              increment: () => update((value) => value + 1),
            }));
            return { count };
          },
        );

        const CounterView = craftComponent(
          'CounterView',
          {},
          function* () {
            const { count } = yield* Counter();
            const label = craftComputed('label', function* () {
              return \`n=\${yield* count()}\`;
            });
            const bump = craftMethod('bump', function* () {
              yield* count.increment();
            });
            return { count, label, bump };
          },
          ({ count, label, bump }) =>
            div([
              ifBlock(label, () => span(function* () { return yield* label(); })),
              span(function* () { return yield* count.doubled(); }),
              button({ *click() { yield* bump(); } }, ['+']),
              button({ *click() { yield* count.increment(); } }, ['inc']),
            ]),
        );
      `,
    });

    const graph = analyzeDependencyGraph({
      rootDir: root,
      tsConfigFilePath: 'tsconfig.json',
    });

    expect(edgeLabels(graph, 'craftComputed:label', 'depends-on')).toContain(
      'depends-on->state:count',
    );
    expect(edgeLabels(graph, 'craftMethod:bump')).toEqual(
      expect.arrayContaining([expect.stringMatching(/calls->.*increment/)]),
    );

    const templateReads = graph.edges.filter(
      (edge) =>
        edge.kind === 'uses-property' &&
        String(edge.details?.['usage'] ?? '').includes('template'),
    );
    const templateCalls = graph.edges.filter(
      (edge) =>
        edge.kind === 'calls' &&
        String(edge.details?.['usage'] ?? '').includes('template'),
    );
    const readLabels = templateReads.map((edge) => {
      const target = graph.nodes.find((node) => node.id === edge.to);
      return target?.label;
    });
    const callLabels = templateCalls.map((edge) => {
      const target = graph.nodes.find((node) => node.id === edge.to);
      return target?.label;
    });

    expect(readLabels).toEqual(
      expect.arrayContaining([
        'craftComputed:label',
        'craftComputed:doubled',
      ]),
    );
    expect(callLabels).toEqual(
      expect.arrayContaining([
        'craftMethod:bump',
        expect.stringMatching(/increment/),
      ]),
    );
  });
});

describe('analyzeDependencyGraph architecture facts', () => {
  it('records browserBoundary on craftService nodes', async () => {
    const root = await fixture({
      'storage.ts': `
        ${CRAFT_STUBS}

        const { LocalStore } = craftService(
          { name: 'LocalStore', providedIn: 'global', browserBoundary: true },
          () => ({}),
        );

        const { Counter } = craftService(
          { name: 'Counter', providedIn: 'global' },
          () => ({}),
        );
      `,
    });

    const graph = analyzeDependencyGraph({
      rootDir: root,
      tsConfigFilePath: 'tsconfig.json',
    });

    expect(nodeByLabel(graph, 'LocalStore')[0]?.details?.['browserBoundary']).toBe(
      true,
    );
    expect(nodeByLabel(graph, 'Counter')[0]?.details?.['browserBoundary']).toBe(
      false,
    );
  });

  it('records provides edges from route and component providers', async () => {
    const root = await fixture({
      'app.ts': `
        ${CRAFT_STUBS}
        declare function craftRoutes(...args: unknown[]): unknown;
        declare function craftRoute(...args: unknown[]): unknown;

        const { User, provideUser } = craftService(
          { name: 'User', providedIn: 'toProvide' },
          () => ({}),
        );

        const { Cart, provideCart } = craftService(
          { name: 'Cart', providedIn: 'toProvide' },
          () => ({}),
        );

        const Checkout = craftComponent(
          'Checkout',
          { providers: [provideCart()] },
          () => ({}),
          () => div([]),
        );

        export const appRoutes = craftRoutes('appRoutes', [
          craftRoute('/admin', { path: '/admin', providers: [provideUser()] }),
        ]);
      `,
    });

    const graph = analyzeDependencyGraph({
      rootDir: root,
      tsConfigFilePath: 'tsconfig.json',
    });

    expect(edgeLabels(graph, 'appRoutes:/admin', 'provides')).toContain(
      'provides->User',
    );
    expect(edgeLabels(graph, 'Checkout', 'provides')).toContain('provides->Cart');
  });

  it('promotes CraftHttpClient usages to http-endpoint nodes', async () => {
    const root = await fixture({
      'api.ts': `
        ${CRAFT_STUBS}
        declare const CraftHttpClient: {
          get(config: (helpers: { response: () => unknown }) => { url: string }): unknown;
        };

        const { UsersApi } = craftService(
          { name: 'UsersApi', providedIn: 'global', browserBoundary: true },
          function* () {
            const users = yield* CraftHttpClient.get(({ response }) => ({
              url: 'users',
              success: response(),
            }));
            return { users };
          },
        );
      `,
    });

    const graph = analyzeDependencyGraph({
      rootDir: root,
      tsConfigFilePath: 'tsconfig.json',
    });

    const endpoint = graph.nodes.find((node) => node.kind === 'http-endpoint');
    expect(endpoint?.label).toBe('GET users');
    expect(endpoint?.details?.['method']).toBe('GET');
    expect(endpoint?.details?.['url']).toBe('users');
    expect(endpoint?.filePath).toContain('api.ts');
    expect(endpoint?.line).toEqual(expect.any(Number));
    expect(endpoint?.details?.['callSites']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filePath: 'api.ts', line: expect.any(Number) }),
      ]),
    );
    expect(edgeLabels(graph, 'UsersApi', 'calls')).toEqual(
      expect.arrayContaining(['calls->GET users']),
    );
  });

  it('merges craftUnique calls with canonically equal objects into one node', async () => {
    const root = await fixture({
      'app.ts': `
        ${CRAFT_STUBS}

        const { Users } = craftService(
          { name: 'Users', providedIn: 'global' },
          function* () {
            const cached = yield* query(
              'cached',
              {},
              insertStoragePersister(craftUnique({ key: 'user', storeName: 'app' })),
            );
            return { cached };
          },
        );

        const { Profile } = craftService(
          { name: 'Profile', providedIn: 'global' },
          function* () {
            const cached = yield* query(
              'cached',
              {},
              insertStoragePersister(craftUnique({ storeName: 'app', key: 'user' })),
            );
            return { cached };
          },
        );
      `,
    });

    const graph = analyzeDependencyGraph({
      rootDir: root,
      tsConfigFilePath: 'tsconfig.json',
    });

    const uniques = graph.nodes.filter((node) => node.kind === 'unique');
    expect(uniques).toHaveLength(1);
    expect(uniques[0]?.details?.['static']).toBe(true);
    expect(uniques[0]?.details?.['canonical']).toBe(
      '{"key":"user","storeName":"app"}',
    );
    expect(uniques[0]?.details?.['callSites']).toHaveLength(2);
    expect(uniques[0]?.filePath).toContain('app.ts');
    expect(uniques[0]?.line).toEqual(expect.any(Number));
    expect(edgeLabels(graph, 'query:cached', 'calls')).toEqual(
      expect.arrayContaining(['calls->{"key":"user","storeName":"app"}']),
    );
  });

  it('marks a non-literal craftUnique argument as non-static', async () => {
    const root = await fixture({
      'app.ts': `
        ${CRAFT_STUBS}
        const identity = { key: 'user', storeName: 'app' };

        const { Users } = craftService(
          { name: 'Users', providedIn: 'global' },
          function* () {
            const cached = yield* query(
              'cached',
              {},
              insertStoragePersister(craftUnique(identity)),
            );
            return { cached };
          },
        );
      `,
    });

    const graph = analyzeDependencyGraph({
      rootDir: root,
      tsConfigFilePath: 'tsconfig.json',
    });

    const uniques = graph.nodes.filter((node) => node.kind === 'unique');
    expect(uniques).toHaveLength(1);
    expect(uniques[0]?.details?.['static']).toBe(false);
    expect(uniques[0]?.filePath).toContain('app.ts');
  });

  it('records the source file path on every node', async () => {
    const root = await fixture({
      'users-api.ts': `
        ${CRAFT_STUBS}
        declare const CraftHttpClient: {
          get(config: (helpers: { response: () => unknown }) => { url: string }): unknown;
        };

        export const { UsersApi } = craftService(
          { name: 'UsersApi', providedIn: 'global', browserBoundary: true },
          function* () {
            const users = yield* CraftHttpClient.get(({ response }) => ({
              url: 'users',
              success: response(),
            }));
            return { users };
          },
        );
      `,
      'user-list.ts': `
        ${CRAFT_STUBS}
        import { UsersApi } from './users-api';

        export const { UserList, provideUserList } = craftService(
          { name: 'UserList', providedIn: 'toProvide' },
          function* () {
            yield* UsersApi();
            const list = yield* query(
              'userList',
              {},
              insertStoragePersister(craftUnique({ key: 'user-list', storeName: 'shop' })),
            );
            return { list };
          },
        );
      `,
      'admin.ts': `
        ${CRAFT_STUBS}
        import { UserList, provideUserList } from './user-list';
        declare function craftRoutes(...args: unknown[]): unknown;
        declare function craftRoute(...args: unknown[]): unknown;

        const Admin = craftComponent(
          'Admin',
          {},
          function* () {
            yield* UserList();
            return {};
          },
          () => div([]),
        );

        export const appRoutes = craftRoutes('appRoutes', [
          craftRoute('/admin', {
            path: '/admin',
            providers: [provideUserList()],
            loadComponent: () => Promise.resolve(Admin),
          }),
        ]);
      `,
    });

    const graph = analyzeDependencyGraph({
      rootDir: root,
      tsConfigFilePath: 'tsconfig.json',
    });

    const missing = graph.nodes.filter((node) => !node.filePath);
    expect(missing.map((node) => `${node.kind}:${node.label}`)).toEqual([]);
    expect(
      graph.nodes.find((node) => node.kind === 'service' && node.label === 'UsersApi')
        ?.filePath,
    ).toContain('users-api.ts');
    expect(
      graph.nodes.find((node) => node.kind === 'component' && node.label === 'Admin')
        ?.filePath,
    ).toContain('admin.ts');
    expect(graph.nodes.find((node) => node.kind === 'route')?.filePath).toContain(
      'admin.ts',
    );
    expect(graph.nodes.find((node) => node.kind === 'unique')?.filePath).toContain(
      'user-list.ts',
    );
    expect(
      graph.nodes.find((node) => node.kind === 'http-endpoint')?.filePath,
    ).toContain('users-api.ts');
  });
});

describe('analyzeDependencyGraph insertions', () => {
  it('links insertReactOnMutation from the mutation to the query', async () => {
    const root = await fixture({
      'users.ts': `
        ${CRAFT_STUBS}

        const { Users } = craftService(
          { name: 'Users', providedIn: 'global' },
          function* () {
            const updateUserName = yield* mutation('updateUserName', {});
            const user = yield* query(
              'user',
              {},
              insertReactOnMutation(updateUserName, {}),
            );
            return { user, updateUserName };
          },
        );
      `,
    });

    const graph = analyzeDependencyGraph({
      rootDir: root,
      tsConfigFilePath: 'tsconfig.json',
    });

    expect(edgeLabels(graph, 'mutation:updateUserName', 'triggers')).toContain(
      'triggers->query:user',
    );
  });

  it('links insertReactOnMutation nested in insertQueryPipe', async () => {
    const root = await fixture({
      'users.ts': `
        ${CRAFT_STUBS}

        const { Users } = craftService(
          { name: 'Users', providedIn: 'global' },
          function* () {
            const save = yield* mutation('updateUserName', {});
            const user = yield* query(
              'user',
              {},
              insertQueryPipe(insertReactOnMutation(save, {})),
            );
            return { user, save };
          },
        );
      `,
    });

    const graph = analyzeDependencyGraph({
      rootDir: root,
      tsConfigFilePath: 'tsconfig.json',
    });

    expect(edgeLabels(graph, 'mutation:updateUserName', 'triggers')).toContain(
      'triggers->query:user',
    );
  });

  it('marks a persisted primitive and whether craftUnique wraps the identity', async () => {
    const root = await fixture({
      'users.ts': `
        ${CRAFT_STUBS}

        const { Users } = craftService(
          { name: 'Users', providedIn: 'global' },
          function* () {
            const cached = yield* query(
              'cached',
              {},
              insertStoragePersister(craftUnique({ key: 'user', storeName: 'app' })),
            );
            const leaked = yield* query(
              'leaked',
              {},
              insertStoragePersister({ key: 'leaked', storeName: 'app' }),
            );
            return { cached, leaked };
          },
        );
      `,
    });

    const graph = analyzeDependencyGraph({
      rootDir: root,
      tsConfigFilePath: 'tsconfig.json',
    });

    expect(nodeByLabel(graph, 'query:cached')[0]?.details?.['persisted']).toBe(
      true,
    );
    expect(
      nodeByLabel(graph, 'query:cached')[0]?.details?.['persistedUnique'],
    ).toBe(true);
    expect(nodeByLabel(graph, 'query:leaked')[0]?.details?.['persisted']).toBe(
      true,
    );
    expect(
      nodeByLabel(graph, 'query:leaked')[0]?.details?.['persistedUnique'],
    ).toBe(false);
  });

  it('attributes CraftHttpClient calls inside craftEffect to the effect node', async () => {
    const root = await fixture({
      'sync.ts': `
        ${CRAFT_STUBS}
        declare const CraftHttpClient: {
          get(config: (helpers: { response: () => unknown }) => { url: string }): unknown;
        };

        const { Sync } = craftService(
          { name: 'Sync', providedIn: 'global' },
          function* () {
            const poll = craftEffect('poll', function* () {
              yield* CraftHttpClient.get(({ response }) => ({
                url: 'users',
                success: response(),
              }));
            });
            return { poll };
          },
        );
      `,
    });

    const graph = analyzeDependencyGraph({
      rootDir: root,
      tsConfigFilePath: 'tsconfig.json',
    });

    expect(edgeLabels(graph, 'craftEffect:poll', 'calls')).toContain(
      'calls->GET users',
    );
  });

  it('records a craftEffect that calls a mutation', async () => {
    const root = await fixture({
      'sync.ts': `
        ${CRAFT_STUBS}

        const { Sync } = craftService(
          { name: 'Sync', providedIn: 'global' },
          function* () {
            const save = yield* mutation('save', {});
            const poll = craftEffect('poll', function* () {
              yield* save();
            });
            return { save, poll };
          },
        );
      `,
    });

    const graph = analyzeDependencyGraph({
      rootDir: root,
      tsConfigFilePath: 'tsconfig.json',
    });

    expect(edgeLabels(graph, 'craftEffect:poll')).toEqual(
      expect.arrayContaining([expect.stringMatching(/->mutation:save/)]),
    );
  });

  it('indexes insertSelect under the enclosing state', async () => {
    const root = await fixture({
      'grid.ts': `
        ${CRAFT_STUBS}

        const { Grid } = craftService(
          { name: 'Grid', providedIn: 'global' },
          function* () {
            const cells = yield* state(
              'cells',
              [],
              insertSelect('cell', () => ({})),
              insertSelect('cell', () => ({})),
            );
            return { cells };
          },
        );
      `,
    });

    const graph = analyzeDependencyGraph({
      rootDir: root,
      tsConfigFilePath: 'tsconfig.json',
    });

    expect(nodeByLabel(graph, 'insertSelect:cell')).toHaveLength(2);
    expect(edgeLabels(graph, 'state:cells', 'contains')).toEqual(
      expect.arrayContaining([
        'contains->insertSelect:cell',
      ]),
    );
  });

  it('hosts the primitives a craftStateMachine declares', async () => {
    const root = await fixture({
      'editor.ts': `
        ${CRAFT_STUBS}

        const Editor = craftComponent(
          'Editor',
          {},
          function* () {
            const machine = yield* craftStateMachine(
              'editor',
              function* () {
                const draft = yield* state('draft', '');
                const save = yield* mutation('save', {});
                return { draft, save };
              },
              function* (context, transit) {
                return {
                  reading: transitionStep(function* () {
                    yield* initStateMachine(() => transit());
                  }),
                };
              },
              function* () {
                return { reading: {} };
              },
              function* ({ currentStep }) {
                return {
                  isReading: craftComputed('isReading', () => currentStep()),
                };
              },
            );
            return { machine };
          },
          () => div([]),
        );
      `,
    });

    const graph = analyzeDependencyGraph({
      rootDir: root,
      tsConfigFilePath: 'tsconfig.json',
    });

    expect(nodeByLabel(graph, 'craftStateMachine:editor')).toHaveLength(1);

    // The component owns the machine…
    expect(edgeLabels(graph, 'Editor', 'contains')).toEqual(
      expect.arrayContaining(['contains->craftStateMachine:editor']),
    );

    // …and the machine owns what it declares, instead of the primitives
    // flattening into the component around it.
    expect(edgeLabels(graph, 'craftStateMachine:editor', 'contains')).toEqual(
      expect.arrayContaining([
        'contains->state:draft',
        'contains->mutation:save',
        'contains->craftComputed:isReading',
      ]),
    );
    expect(edgeLabels(graph, 'Editor', 'contains')).not.toEqual(
      expect.arrayContaining(['contains->state:draft']),
    );
  });
});
