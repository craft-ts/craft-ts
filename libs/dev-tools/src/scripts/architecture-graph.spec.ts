import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeDependencyGraph, writeDependencyGraph } from './dependency-graph';
import {
  assertCraftComputedPure,
  assertCraftEffectNoImperativeSync,
  assertCraftEffectNoNetwork,
  assertPrimitiveLoaderRequirements,
  assertQueryMutationHasServerState,
  assertCraftHandshake,
  assertCraftUnique,
  craftHandshakeViolations,
  assertDeclarativeArchitecture,
  assertHttpEndpointUnique,
  assertInsertSelectUnique,
  assertInteractiveElementNamed,
  assertMutationHasReactOn,
  assertNoDependencyCycles,
  assertNoAppConfigRouteCycles,
  assertPathBoundaries,
  assertPersistedPrimitiveHasUnique,
  assertRouteDiProofs,
  assertServerFunctionArchitecture,
  craftComputedPureViolations,
  craftEffectImperativeSyncViolations,
  craftEffectNetworkViolations,
  createArchitectureGraph,
  dependencyCycleViolations,
  appConfigRouteCycleViolations,
  httpEndpointUniqueViolations,
  insertSelectUniqueViolations,
  interactiveElementNamedViolations,
  type LoaderRequirementContext,
  mutationReactOnViolations,
  noExclusiveLink,
  pathBoundaryViolations,
  primitiveLoaderRequirementViolations,
  queryMutationServerStateViolations,
  persistedPrimitiveUniqueViolations,
  routeDiProofViolations,
  serverFunctionArchitectureViolations,
} from './architecture-graph';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'craft-architecture-graph-'));
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
    Object.entries(files).map(async ([path, contents]) => {
      const fullPath = join(root, path);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, contents, 'utf8');
    }),
  );
  return root;
}

async function graphOf(files: Record<string, string>) {
  const root = await fixture(files);
  return createArchitectureGraph(
    analyzeDependencyGraph({
      rootDir: root,
      tsConfigFilePath: 'tsconfig.json',
    }),
  );
}

const STUBS = `
declare function craftService(...args: unknown[]): Record<string, (...args: never[]) => unknown>;
declare function craftComponent(...args: unknown[]): unknown;
declare function craftRoutes(...args: unknown[]): unknown;
declare function craftRoute(...args: unknown[]): unknown;
declare function state(...args: unknown[]): unknown;
declare function query(...args: unknown[]): unknown;
declare function mutation(...args: unknown[]): unknown;
declare function asyncProcess(...args: unknown[]): unknown;
declare function craftUnique<T>(value: T): T;
declare function insertStoragePersister(...args: unknown[]): unknown;
declare function insertReactOnMutation(...args: unknown[]): unknown;
declare function insertSelect(...args: unknown[]): unknown;
declare function craftComputed(...args: unknown[]): unknown;
declare function craftMethod(...args: unknown[]): unknown;
declare function craftEffect(...args: unknown[]): unknown;
declare function source$<T>(name: string): {
  emit: (value?: T) => void;
  set: (value: T) => void;
};
declare function div(...args: unknown[]): unknown;
declare function button(...args: unknown[]): unknown;
declare function input(...args: unknown[]): unknown;
declare function a(...args: unknown[]): unknown;
declare function select(...args: unknown[]): unknown;
declare function textarea(...args: unknown[]): unknown;
declare function form(...args: unknown[]): unknown;
declare function span(...args: unknown[]): unknown;
declare function h(...args: unknown[]): unknown;
declare const CraftHttpClient: {
  get(config: (helpers: { response: () => unknown }) => { url: string }): unknown;
  post(config: (helpers: { response: () => unknown }) => { url: string }): unknown;
};
`;

describe('createArchitectureGraph', () => {
  it('detects app-config/routes import cycles before provider inference widens', async () => {
    const graph = await graphOf({
      'app.config.ts': `
        import { appRoutes } from './app.routes';
        declare function craftAppConfig(value: unknown): unknown;
        export const appConfig = craftAppConfig({ routingDeps: appRoutes });
      `,
      'app.routes.ts': `
        import type { appConfig } from './app.config';
        ${STUBS}
        export const appRoutes = craftRoutes('app', [{ path: '', component: {} }]);
      `,
    });

    expect(appConfigRouteCycleViolations(graph.graph)).toHaveLength(1);
    expect(() => assertNoAppConfigRouteCycles(graph.graph)).toThrow(
      'App config/routes dependency cycle',
    );
  });

  it('looks up routes, provided services, HTTP endpoints and browser boundaries', async () => {
    const root = await fixture({
      'app.ts': `
        ${STUBS}

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

        const { User, provideUser } = craftService(
          { name: 'User', providedIn: 'toProvide' },
          function* () {
            const { users } = yield* UsersApi();
            return { users };
          },
        );

        const { Cart, provideCart } = craftService(
          { name: 'Cart', providedIn: 'toProvide' },
          () => ({}),
        );

        const Admin = craftComponent(
          'Admin',
          {},
          function* () {
            yield* User();
            return {};
          },
          () => div([]),
        );

        export const appRoutes = craftRoutes('appRoutes', [
          craftRoute('/admin', {
            path: '/admin',
            providers: [provideUser()],
            loadComponent: () => Promise.resolve(Admin),
          }),
          craftRoute('/checkout', {
            path: '/checkout',
            providers: [provideCart()],
          }),
        ]);
      `,
    });

    const graph = createArchitectureGraph(
      analyzeDependencyGraph({
        rootDir: root,
        tsConfigFilePath: 'tsconfig.json',
      }),
    );

    expect(graph.route('/admin').label).toContain('/admin');
    expect(graph.route('/admin').provider('User').label).toBe('User');
    expect(graph.providedOn('User').map((node) => node.label)).toEqual(
      expect.arrayContaining([expect.stringContaining('/admin')]),
    );
    expect(graph.httpEndpoint('GET', 'users').label).toBe('GET users');
    expect(graph.usingHttp().map((node) => node.label)).toContain('UsersApi');
    expect(
      graph.services({ browserBoundary: true }).map((node) => node.label),
    ).toEqual(['UsersApi']);
    expect(graph.dependingOnBrowserBoundary().map((node) => node.label)).toContain(
      'User',
    );
    expect(graph.catalog.browserBoundaryServices).toContain('UsersApi');
    expect(graph.catalog.httpEndpoints).toEqual(
      expect.arrayContaining([{ method: 'GET', url: 'users' }]),
    );
    expect(graph.catalog.routeProviders['/admin']).toEqual(['User']);
  });

  it('allows a shared kernel between exclusive feature branches', async () => {
    const root = await fixture({
      'app.ts': `
        ${STUBS}

        const { Auth } = craftService(
          { name: 'Auth', providedIn: 'global' },
          () => ({}),
        );

        const { User, provideUser } = craftService(
          { name: 'User', providedIn: 'toProvide' },
          function* () {
            yield* Auth();
            return {};
          },
        );

        const { Cart, provideCart } = craftService(
          { name: 'Cart', providedIn: 'toProvide' },
          function* () {
            yield* Auth();
            return {};
          },
        );

        export const appRoutes = craftRoutes('appRoutes', [
          craftRoute('/admin', { path: '/admin', providers: [provideUser()] }),
          craftRoute('/checkout', { path: '/checkout', providers: [provideCart()] }),
        ]);
      `,
    });

    const graph = createArchitectureGraph(
      analyzeDependencyGraph({
        rootDir: root,
        tsConfigFilePath: 'tsconfig.json',
      }),
    );

    expect(() =>
      noExclusiveLink(graph.route('/admin'), graph.route('/checkout')),
    ).not.toThrow();
  });

  it('rejects an exclusive link from one provided branch into another', async () => {
    const root = await fixture({
      'app.ts': `
        ${STUBS}

        const { User, provideUser } = craftService(
          { name: 'User', providedIn: 'toProvide' },
          () => ({}),
        );

        const { Cart, provideCart } = craftService(
          { name: 'Cart', providedIn: 'toProvide' },
          function* () {
            yield* User();
            return {};
          },
        );

        export const appRoutes = craftRoutes('appRoutes', [
          craftRoute('/admin', { path: '/admin', providers: [provideUser()] }),
          craftRoute('/checkout', { path: '/checkout', providers: [provideCart()] }),
        ]);
      `,
    });

    const graph = createArchitectureGraph(
      analyzeDependencyGraph({
        rootDir: root,
        tsConfigFilePath: 'tsconfig.json',
      }),
    );

    expect(() =>
      noExclusiveLink(graph.route('/admin'), graph.route('/checkout')),
    ).toThrow(/Exclusive architecture link/);
  });

  it('throws when a named node does not exist', async () => {
    const root = await fixture({
      'app.ts': `
        ${STUBS}
        const { User } = craftService({ name: 'User', providedIn: 'global' }, () => ({}));
      `,
    });

    const graph = createArchitectureGraph(
      analyzeDependencyGraph({
        rootDir: root,
        tsConfigFilePath: 'tsconfig.json',
      }),
    );

    expect(() => graph.service('Missing')).toThrow(/Unknown service 'Missing'/);
  });

  it('requires a file path when two services share a name', async () => {
    const root = await fixture({
      'users-api.ts': `
        ${STUBS}
        const { ApiService } = craftService({ name: 'ApiService', providedIn: 'global' }, () => ({}));
      `,
      'cart-api.ts': `
        ${STUBS}
        const { ApiService } = craftService({ name: 'ApiService', providedIn: 'global' }, () => ({}));
      `,
    });

    const graph = createArchitectureGraph(
      analyzeDependencyGraph({
        rootDir: root,
        tsConfigFilePath: 'tsconfig.json',
      }),
    );

    expect(() => graph.service('ApiService')).toThrow(/Ambiguous service 'ApiService'/);
    expect(graph.service('ApiService', 'users-api.ts').filePath).toContain(
      'users-api.ts',
    );
  });

  it('writes a compact TypeScript catalog next to the JSON graph', async () => {
    const root = await fixture({
      'app.ts': `
        ${STUBS}
        const { User, provideUser } = craftService(
          { name: 'User', providedIn: 'toProvide' },
          () => ({}),
        );
        export const appRoutes = craftRoutes('appRoutes', [
          craftRoute('/admin', { path: '/admin', providers: [provideUser()] }),
        ]);
      `,
    });

    await writeDependencyGraph({
      rootDir: root,
      tsConfigFilePath: 'tsconfig.json',
      outputPath: join(root, 'craft-dependency-graph'),
      format: 'json',
    });

    const catalogSource = await readFile(
      join(root, 'craft-dependency-graph.architecture.ts'),
      'utf8',
    );
    expect(catalogSource).toContain('as const');
    expect(catalogSource).toContain('"/admin"');
    expect(catalogSource).toContain('"User"');
    expect(catalogSource).toContain('export type ArchitectureCatalog');
  });

  it('indexes craftUnique values and rejects duplicates or non-static identities', async () => {
    const duplicateRoot = await fixture({
      'app.ts': `
        ${STUBS}

        const { Users } = craftService(
          { name: 'Users', providedIn: 'global' },
          function* () {
            yield* query(
              'cached',
              {},
              insertStoragePersister(craftUnique({ key: 'user', storeName: 'app' })),
            );
            return {};
          },
        );

        const { Profile } = craftService(
          { name: 'Profile', providedIn: 'global' },
          function* () {
            yield* query(
              'cached',
              {},
              insertStoragePersister(craftUnique({ storeName: 'app', key: 'user' })),
            );
            return {};
          },
        );
      `,
    });

    const duplicateGraph = createArchitectureGraph(
      analyzeDependencyGraph({
        rootDir: duplicateRoot,
        tsConfigFilePath: 'tsconfig.json',
      }),
    );

    expect(duplicateGraph.catalog.uniques).toEqual([
      '{"key":"user","storeName":"app"}',
    ]);
    expect(
      duplicateGraph.unique('{"key":"user","storeName":"app"}').details?.[
        'callSites'
      ],
    ).toHaveLength(2);
    expect(() => assertCraftUnique(duplicateGraph.graph)).toThrow(
      /craftUnique.*twice|duplicate/i,
    );

    const okRoot = await fixture({
      'app.ts': `
        ${STUBS}

        const { Users } = craftService(
          { name: 'Users', providedIn: 'global' },
          function* () {
            yield* query(
              'cached',
              {},
              insertStoragePersister(craftUnique({ key: 'user', storeName: 'app' })),
            );
            return {};
          },
        );
      `,
    });

    const okGraph = analyzeDependencyGraph({
      rootDir: okRoot,
      tsConfigFilePath: 'tsconfig.json',
    });
    expect(() => assertCraftUnique(okGraph)).not.toThrow();

    const dynamicRoot = await fixture({
      'app.ts': `
        ${STUBS}
        const identity = { key: 'user', storeName: 'app' };

        const { Users } = craftService(
          { name: 'Users', providedIn: 'global' },
          function* () {
            yield* query(
              'cached',
              {},
              insertStoragePersister(craftUnique(identity)),
            );
            return {};
          },
        );
      `,
    });

    expect(() =>
      assertCraftUnique(
        analyzeDependencyGraph({
          rootDir: dynamicRoot,
          tsConfigFilePath: 'tsconfig.json',
        }),
      ),
    ).toThrow(/non-static|not static/i);
  });
});

describe('server function architecture', () => {
  it('models a client-exposed family and accepts its three boundaries', async () => {
    const graph = await graphOf({
      'users/list.fn-contract.ts': `
        declare function serverFunctionContract(value: unknown): unknown;
        export const usersListContract = serverFunctionContract({ id: 'users.list', input: {}, exposure: 'client' });
      `,
      'users/list.fn-serveur.ts': `
        import { usersListContract } from './list.fn-contract';
        declare function serverFunction(value: unknown): { handler(value: unknown): unknown };
        export const getUsers = serverFunction(usersListContract).handler(() => ({ ok: true }));
      `,
      'users/list.fn-client.ts': `
        import type { getUsers as ServerGetUsers } from './list.fn-serveur';
        declare function craftUnique<T>(value: T): T;
        declare function createServerFunctionClient(value: unknown): unknown;
        export const getUsers = createServerFunctionClient<ServerGetUsers>(craftUnique('users.list'));
      `,
    });

    expect(graph.catalog.serverFunctionFamilies).toEqual(['users.list']);
    expect(graph.serverFunctionFamily('users.list').kind).toBe(
      'server-function-family',
    );
    expect(serverFunctionArchitectureViolations(graph.graph)).toEqual([]);
    expect(() => assertServerFunctionArchitecture(graph.graph)).not.toThrow();
  });

  it('accepts a client-exposed family without a separate contract file', async () => {
    const graph = await graphOf({
      'users/simple.fn-serveur.ts': `
        declare function serverFunction(...values: unknown[]): { handler(value: unknown): unknown };
        export const listUsers = serverFunction('users.simple', {}, { exposure: 'client' }).handler(() => ({ ok: true }));
      `,
      'users/simple.fn-client.ts': `
        import type { listUsers as ServerListUsers } from './simple.fn-serveur';
        declare function craftUnique<T>(value: T): T;
        declare function createServerFunctionClient<T>(id: string): unknown;
        export const getUsers = createServerFunctionClient<typeof ServerListUsers>(craftUnique('users.simple'));
      `,
    });

    expect(graph.catalog.serverFunctionFamilies).toEqual(['users.simple']);
    expect(serverFunctionArchitectureViolations(graph.graph)).toEqual([]);
    expect(() => assertServerFunctionArchitecture(graph.graph)).not.toThrow();
  });

  it('reports a client id or definition that does not match its server family', async () => {
    const graph = await graphOf({
      'users/list.fn-serveur.ts': `
        declare function serverFunction(...values: unknown[]): { handler(value: unknown): unknown };
        export const listUsers = serverFunction('users.list', {}).handler(() => ({ ok: true }));
      `,
      'users/list.fn-client.ts': `
        import type { listUsers as ServerListUsers } from './list.fn-serveur';
        declare function craftUnique<T>(value: T): T;
        declare function createServerFunctionClient<T>(id: unknown): unknown;
        export const getUsers = createServerFunctionClient<typeof ServerListUsers>(craftUnique('users.wrong'));
      `,
    });

    expect(
      serverFunctionArchitectureViolations(graph.graph).map(
        (violation) => violation.code,
      ),
    ).toContain('CRAFT_SERVER_FUNCTION_CLIENT_ID_MISMATCH');
  });

  it('rejects a facade that imports the server definition from another family', async () => {
    const graph = await graphOf({
      'users/list.fn-serveur.ts': `
        declare function serverFunction(...values: unknown[]): { handler(value: unknown): unknown };
        export const listUsers = serverFunction('users.list', {}).handler(() => ({ ok: true }));
      `,
      'users/authenticated.fn-serveur.ts': `
        declare function serverFunction(...values: unknown[]): { handler(value: unknown): unknown };
        export const authenticatedUsers = serverFunction('users.authenticated', {}).handler(() => ({ ok: true }));
      `,
      'users/list.fn-client.ts': `
        import type { authenticatedUsers as ServerAuthenticatedUsers } from './authenticated.fn-serveur';
        declare function craftUnique<T>(value: T): T;
        declare function createServerFunctionClient<T>(id: unknown): unknown;
        export const getUsers = createServerFunctionClient<typeof ServerAuthenticatedUsers>(craftUnique('users.authenticated'));
      `,
    });

    expect(
      serverFunctionArchitectureViolations(graph.graph).map(
        (violation) => violation.code,
      ),
    ).toContain('CRAFT_SERVER_FUNCTION_CLIENT_DEFINITION_MISMATCH');
  });

  it('requires craftUnique for client identities and rejects duplicate client keys', async () => {
    const graph = await graphOf({
      'users/one.fn-serveur.ts': `
        declare function serverFunction(...values: unknown[]): { handler(value: unknown): unknown };
        export const one = serverFunction('users.one', {}).handler(() => ({ ok: true }));
      `,
      'users/one.fn-client.ts': `
        import type { one as ServerOne } from './one.fn-serveur';
        declare function createServerFunctionClient<T>(id: unknown): unknown;
        export const oneClient = createServerFunctionClient<typeof ServerOne>('users.one');
      `,
      'users/two.fn-serveur.ts': `
        declare function serverFunction(...values: unknown[]): { handler(value: unknown): unknown };
        export const two = serverFunction('users.two', {}).handler(() => ({ ok: true }));
      `,
      'users/two.fn-client.ts': `
        import type { two as ServerTwo } from './two.fn-serveur';
        declare function craftUnique<T>(value: T): T;
        declare function createServerFunctionClient<T>(id: unknown): unknown;
        export const twoClient = createServerFunctionClient<typeof ServerTwo>(craftUnique('users.one'));
      `,
      'users/three.fn-serveur.ts': `
        declare function serverFunction(...values: unknown[]): { handler(value: unknown): unknown };
        export const three = serverFunction('users.three', {}).handler(() => ({ ok: true }));
      `,
      'users/three.fn-client.ts': `
        import type { three as ServerThree } from './three.fn-serveur';
        declare function craftUnique<T>(value: T): T;
        declare function createServerFunctionClient<T>(id: unknown): unknown;
        export const threeClient = createServerFunctionClient<typeof ServerThree>(craftUnique('users.one'));
      `,
    });

    expect(
      serverFunctionArchitectureViolations(graph.graph).map(
        (violation) => violation.code,
      ),
    ).toContain('CRAFT_SERVER_FUNCTION_CLIENT_ID_NOT_UNIQUE');
    expect(() => assertCraftUnique(graph.graph)).toThrow(/Duplicate craftUnique/);
  });

  it('reports missing families, server imports in clients, a client context on a server-only function, and duplicate ids', async () => {
    const graph = await graphOf({
      'broken.fn-contract.ts': `
        declare function serverFunctionContract(value: unknown): unknown;
        export const brokenContract = serverFunctionContract({ id: 'broken', input: {}, exposure: 'client' });
      `,
      'orphan.fn-client.ts': `
        import { brokenServer } from './broken.fn-serveur';
        declare function createServerFunctionClient(value: unknown): unknown;
        export const orphan = createServerFunctionClient(brokenServer);
      `,
      'broken.fn-serveur.ts': `
        declare function serverFunction(...values: unknown[]): { handler(value: unknown): unknown };
        export const brokenServer = serverFunction('broken', {}).handler(() => 1);
      `,
      'duplicate-one.fn-serveur.ts': `
        declare function serverFunction(...values: unknown[]): { handler(value: unknown): unknown };
        export const one = serverFunction('duplicate', {}).handler(() => 1);
      `,
      'duplicate-two.fn-serveur.ts': `
        declare function serverFunction(...values: unknown[]): { handler(value: unknown): unknown };
        export const two = serverFunction('duplicate', {}).handler(() => 2);
      `,
      'client-context-only.fn-serveur.ts': `
        declare function serverFunction(...values: unknown[]): { handler(value: unknown): unknown };
        declare const shape: unknown;
        export const clientContextOnly = serverFunction('client-context-only', {}, { exposure: 'server', clientContext: shape }).handler(() => 1);
      `,
    });

    const violations = serverFunctionArchitectureViolations(graph.graph);
    expect(violations.map((violation) => violation.code)).toEqual(
      expect.arrayContaining([
        'CRAFT_SERVER_FUNCTION_CLIENT_FAMILY_MISSING',
        'CRAFT_SERVER_FUNCTION_CLIENT_IMPORTS_SERVER',
        'CRAFT_SERVER_FUNCTION_CLIENT_CONTEXT_REQUIRES_CLIENT_EXPOSURE',
        'CRAFT_SERVER_FUNCTION_DUPLICATE_ID',
      ]),
    );
    expect(() => assertServerFunctionArchitecture(graph.graph)).toThrow(
      /CRAFT_SERVER_FUNCTION_CLIENT_IMPORTS_SERVER/,
    );
  });

  it('models middleware, their .use(...) edges and the server functions using them', async () => {
    const graph = await graphOf({
      'users/access.mw-serveur.ts': `
        declare function craftMiddleware(id: string): { use(value: unknown): any; input(value: unknown): any; server(value: unknown): unknown };
        export const adminOnly = craftMiddleware('demo.admin-only').server(() => 1);
        export const matchingUser = craftMiddleware('demo.matching-user').use(adminOnly).input({}).server(() => 1);
      `,
      'users/list.fn-serveur.ts': `
        import { matchingUser } from './access.mw-serveur';
        declare function serverFunction(...values: unknown[]): { use(value: unknown): any; handler(value: unknown): unknown };
        export const listUsers = serverFunction('users.list', {}, { exposure: 'client' }).use(matchingUser).handler(() => 1);
      `,
      'users/list.fn-client.ts': `
        import type { listUsers as ServerListUsers } from './list.fn-serveur';
        declare function craftUnique<T>(value: T): T;
        declare function createServerFunctionClient<T>(id: unknown): unknown;
        export const listUsersClient = createServerFunctionClient<typeof ServerListUsers>(craftUnique('users.list'));
      `,
    });

    expect(
      graph.serverFunctionMiddlewares().map((node) => node.label).sort(),
    ).toEqual(['demo.admin-only', 'demo.matching-user']);

    const edges = graph.graph.edges.filter(
      (edge) => edge.details?.['boundary'] === 'middleware-uses',
    );
    // matchingUser -> adminOnly, et la server function -> matchingUser
    expect(edges).toHaveLength(2);
    expect(
      edges.some(
        (edge) =>
          edge.from.includes('#matchingUser') && edge.to.includes('#adminOnly'),
      ),
    ).toBe(true);
    expect(
      edges.some(
        (edge) =>
          edge.from.startsWith('server-function-part:server-function-server:') &&
          edge.to.includes('#matchingUser'),
      ),
    ).toBe(true);

    expect(serverFunctionArchitectureViolations(graph.graph)).toEqual([]);
  });

  it('flags a craftMiddleware(...) defined outside a *.mw-serveur.ts file', async () => {
    const graph = await graphOf({
      'users/access.ts': `
        declare function craftMiddleware(id: string): { server(value: unknown): unknown };
        export const adminOnly = craftMiddleware('demo.admin-only').server(() => 1);
      `,
    });

    expect(
      serverFunctionArchitectureViolations(graph.graph).map(
        (violation) => violation.code,
      ),
    ).toContain('CRAFT_SERVER_FUNCTION_MIDDLEWARE_NAMING_CONVENTION_MISSING');
  });

  it('flags duplicate middleware ids, cycles and client runtime imports', async () => {
    const graph = await graphOf({
      'users/one.mw-serveur.ts': `
        declare function craftMiddleware(id: string): { use(value: unknown): any; server(value: unknown): unknown };
        export const first = craftMiddleware('demo.duplicate').server(() => 1);
      `,
      'users/two.mw-serveur.ts': `
        declare function craftMiddleware(id: string): { use(value: unknown): any; server(value: unknown): unknown };
        export const second = craftMiddleware('demo.duplicate').server(() => 1);
      `,
      'users/cycle.mw-serveur.ts': `
        import { right } from './cycle-two.mw-serveur';
        declare function craftMiddleware(id: string): { use(value: unknown): any; server(value: unknown): unknown };
        export const left = craftMiddleware('demo.left').use(right).server(() => 1);
      `,
      'users/cycle-two.mw-serveur.ts': `
        import { left } from './cycle.mw-serveur';
        declare function craftMiddleware(id: string): { use(value: unknown): any; server(value: unknown): unknown };
        export const right = craftMiddleware('demo.right').use(left).server(() => 1);
      `,
      'users/leak.fn-serveur.ts': `
        declare function serverFunction(...values: unknown[]): { handler(value: unknown): unknown };
        export const leak = serverFunction('users.leak', {}, { exposure: 'client' }).handler(() => 1);
      `,
      'users/leak.fn-client.ts': `
        import { first } from './one.mw-serveur';
        import type { leak as ServerLeak } from './leak.fn-serveur';
        declare function craftUnique<T>(value: T): T;
        declare function createServerFunctionClient<T>(id: unknown): unknown;
        export const leakClient = createServerFunctionClient<typeof ServerLeak>(craftUnique('users.leak'));
        void first;
      `,
    });

    const codes = serverFunctionArchitectureViolations(graph.graph).map(
      (violation) => violation.code,
    );
    expect(codes).toEqual(
      expect.arrayContaining([
        'CRAFT_SERVER_FUNCTION_MIDDLEWARE_DUPLICATE_ID',
        'CRAFT_SERVER_FUNCTION_MIDDLEWARE_CYCLE',
        'CRAFT_SERVER_FUNCTION_MIDDLEWARE_IMPORTED_BY_CLIENT',
      ]),
    );
    expect(() => assertServerFunctionArchitecture(graph.graph)).toThrow(
      /CRAFT_SERVER_FUNCTION_MIDDLEWARE_CYCLE/,
    );
  });

  it('models client middleware, their .use(...) edges and the facades attaching them', async () => {
    const graph = await graphOf({
      'users/session.mw-client.ts': `
        declare function craftMiddleware(id: string): { use(value: unknown): any; provides(value: unknown): any; client(value: unknown): unknown };
        declare const Schema: { Struct(value: unknown): unknown; String: unknown };
        export const sessionContext = craftMiddleware('demo.session').provides(Schema.Struct({ userId: Schema.String })).client(() => 1);
        export const workspaceContext = craftMiddleware('demo.workspace').use(sessionContext).provides(Schema.Struct({ workspaceId: Schema.String })).client(() => 1);
      `,
      'users/list.fn-serveur.ts': `
        declare function serverFunction(...values: unknown[]): { handler(value: unknown): unknown };
        export const listUsers = serverFunction('users.list', {}, { exposure: 'client' }).handler(({ clientContext }: any) => clientContext.userId + clientContext.workspaceId);
      `,
      'users/list.fn-client.ts': `
        import { workspaceContext } from './session.mw-client';
        import type { listUsers as ServerListUsers } from './list.fn-serveur';
        declare function craftUnique<T>(value: T): T;
        declare function craftClientMiddleware(...values: unknown[]): unknown;
        declare function createServerFunctionClient<T>(id: unknown): { pipe(value: unknown): unknown };
        export const listUsersClient = createServerFunctionClient<typeof ServerListUsers>(craftUnique('users.list')).pipe(craftClientMiddleware(workspaceContext));
      `,
    });

    expect(
      graph.clientFunctionMiddlewares().map((node) => node.label).sort(),
    ).toEqual(['demo.session', 'demo.workspace']);
    // Un middleware client n'est pas un middleware serveur : les deux familles
    // restent disjointes dans le graphe.
    expect(graph.serverFunctionMiddlewares()).toEqual([]);

    const uses = graph.graph.edges.filter(
      (edge) => edge.details?.['boundary'] === 'client-middleware-uses',
    );
    expect(uses).toHaveLength(1);
    expect(
      uses.some(
        (edge) =>
          edge.from.includes('#workspaceContext') &&
          edge.to.includes('#sessionContext'),
      ),
    ).toBe(true);

    const attached = graph.graph.edges.filter(
      (edge) => edge.details?.['boundary'] === 'client-middleware-attached',
    );
    expect(attached).toHaveLength(1);
    expect(
      attached[0]?.from.startsWith(
        'server-function-part:server-function-client:',
      ),
    ).toBe(true);

    expect(serverFunctionArchitectureViolations(graph.graph)).toEqual([]);
  });

  it('accepte un middleware client déclaré à même la façade', async () => {
    const graph = await graphOf({
      'users/list.fn-serveur.ts': `
        declare function serverFunction(...values: unknown[]): { handler(value: unknown): unknown };
        export const listUsers = serverFunction('users.list', {}, { exposure: 'client' }).handler(({ clientContext }: any) => clientContext.userId);
      `,
      'users/list.fn-client.ts': `
        import type { listUsers as ServerListUsers } from './list.fn-serveur';
        declare function craftUnique<T>(value: T): T;
        declare function craftMiddleware(id: string): { provides(value: unknown): any; client(value: unknown): unknown };
        declare const Schema: { Struct(value: unknown): unknown; String: unknown };
        declare function craftClientMiddleware(...values: unknown[]): unknown;
        declare function createServerFunctionClient<T>(id: unknown): { pipe(value: unknown): unknown };

        const sessionContext = craftMiddleware('demo.session').provides(Schema.Struct({ userId: Schema.String })).client(() => 1);

        export const listUsersClient = createServerFunctionClient<typeof ServerListUsers>(craftUnique('users.list')).pipe(craftClientMiddleware(sessionContext));
      `,
    });

    // Une façade est déjà un module navigateur : y déclarer un middleware d'un
    // seul usage ne franchit aucune frontière.
    expect(
      graph.clientFunctionMiddlewares().map((node) => node.label),
    ).toEqual(['demo.session']);
    expect(
      graph.graph.edges.filter(
        (edge) => edge.details?.['boundary'] === 'client-middleware-attached',
      ),
    ).toHaveLength(1);
    expect(serverFunctionArchitectureViolations(graph.graph)).toEqual([]);
  });

  it('flags a .client(...) middleware defined outside a *.mw-client.ts file', async () => {
    const graph = await graphOf({
      'users/session.ts': `
        declare function craftMiddleware(id: string): { client(value: unknown): unknown };
        export const sessionContext = craftMiddleware('demo.session').client(() => 1);
      `,
    });

    expect(
      serverFunctionArchitectureViolations(graph.graph).map(
        (violation) => violation.code,
      ),
    ).toContain(
      'CRAFT_SERVER_FUNCTION_CLIENT_MIDDLEWARE_NAMING_CONVENTION_MISSING',
    );
  });

  it('flags duplicate client middleware ids, cycles and server runtime imports', async () => {
    const graph = await graphOf({
      'users/one.mw-client.ts': `
        declare function craftMiddleware(id: string): { use(value: unknown): any; client(value: unknown): unknown };
        export const first = craftMiddleware('demo.duplicate').client(() => 1);
      `,
      'users/two.mw-client.ts': `
        declare function craftMiddleware(id: string): { use(value: unknown): any; client(value: unknown): unknown };
        export const second = craftMiddleware('demo.duplicate').client(() => 1);
      `,
      'users/cycle.mw-client.ts': `
        import { right } from './cycle-two.mw-client';
        declare function craftMiddleware(id: string): { use(value: unknown): any; client(value: unknown): unknown };
        export const left = craftMiddleware('demo.left').use(right).client(() => 1);
      `,
      'users/cycle-two.mw-client.ts': `
        import { left } from './cycle.mw-client';
        declare function craftMiddleware(id: string): { use(value: unknown): any; client(value: unknown): unknown };
        export const right = craftMiddleware('demo.right').use(left).client(() => 1);
      `,
      'users/leak.fn-serveur.ts': `
        import { first } from './one.mw-client';
        declare function serverFunction(...values: unknown[]): { handler(value: unknown): unknown };
        export const leak = serverFunction('users.leak', {}, { exposure: 'client' }).handler(() => first);
      `,
      'users/leak.fn-client.ts': `
        import type { leak as ServerLeak } from './leak.fn-serveur';
        declare function craftUnique<T>(value: T): T;
        declare function createServerFunctionClient<T>(id: unknown): unknown;
        export const leakClient = createServerFunctionClient<typeof ServerLeak>(craftUnique('users.leak'));
      `,
    });

    const codes = serverFunctionArchitectureViolations(graph.graph).map(
      (violation) => violation.code,
    );
    expect(codes).toEqual(
      expect.arrayContaining([
        'CRAFT_SERVER_FUNCTION_CLIENT_MIDDLEWARE_DUPLICATE_ID',
        'CRAFT_SERVER_FUNCTION_CLIENT_MIDDLEWARE_CYCLE',
        'CRAFT_SERVER_FUNCTION_CLIENT_MIDDLEWARE_IMPORTED_BY_SERVER',
      ]),
    );
    expect(() => assertServerFunctionArchitecture(graph.graph)).toThrow(
      /CRAFT_SERVER_FUNCTION_CLIENT_MIDDLEWARE_CYCLE/,
    );
  });

  it('signale, en heuristique, un contexte client que personne ne lit côté serveur', async () => {
    const graph = await graphOf({
      'users/session.mw-client.ts': `
        declare function craftMiddleware(id: string): { provides(value: unknown): any; client(value: unknown): unknown };
        declare const Schema: { Struct(value: unknown): unknown; String: unknown };
        export const sessionContext = craftMiddleware('demo.session').provides(Schema.Struct({ userId: Schema.String })).client(() => 1);
      `,
      'users/list.fn-serveur.ts': `
        declare function serverFunction(...values: unknown[]): { handler(value: unknown): unknown };
        export const listUsers = serverFunction('users.list', {}, { exposure: 'client' }).handler(({ input }: any) => input.filter);
      `,
      'users/list.fn-client.ts': `
        import type { listUsers as ServerListUsers } from './list.fn-serveur';
        declare function craftUnique<T>(value: T): T;
        declare function createServerFunctionClient<T>(id: unknown): unknown;
        export const listUsersClient = createServerFunctionClient<typeof ServerListUsers>(craftUnique('users.list'));
      `,
    });

    expect(
      serverFunctionArchitectureViolations(graph.graph).map(
        (violation) => violation.code,
      ),
    ).toContain('CRAFT_SERVER_FUNCTION_CLIENT_CONTEXT_UNUSED');
  });

  it('tient un handshake référencé des deux côtés, et lui confie l’identité', async () => {
    const graph = await graphOf({
      'users/list.handshake.ts': `
        declare function craftHandshake<N extends string>(name: N, schema?: unknown): N;
        declare const Schema: { Struct(value: unknown): unknown; String: unknown };
        export const listUsers = craftHandshake('users.list');
        export const sessionShape = craftHandshake('users.session', Schema.Struct({ userId: Schema.String }));
      `,
      'users/session.mw-serveur.ts': `
        import { sessionShape } from './list.handshake';
        declare function craftMiddleware(id: string): { clientContext(value: unknown): any; server(value: unknown): unknown };
        export const claimedUser = craftMiddleware('demo.claimed-user').clientContext(sessionShape).server(({ clientContext }: any) => clientContext.userId);
      `,
      'users/list.fn-serveur.ts': `
        import { listUsers } from './list.handshake';
        import { claimedUser } from './session.mw-serveur';
        declare function serverFunction(...values: unknown[]): { use(value: unknown): any; handler(value: unknown): unknown };
        export const listUsersFn = serverFunction(listUsers, {}, { exposure: 'client' }).use(claimedUser).handler(() => 1);
      `,
      'users/list.fn-client.ts': `
        import { listUsers, sessionShape } from './list.handshake';
        import type { listUsersFn as ServerListUsers } from './list.fn-serveur';
        declare function craftMiddleware(id: string): { provides(value: unknown): any; client(value: unknown): unknown };
        declare function craftClientMiddleware(...values: unknown[]): unknown;
        declare function createServerFunctionClient<T>(id: unknown): { pipe(value: unknown): unknown };
        const session = craftMiddleware('demo.session').provides(sessionShape).client(() => 1);
        export const listUsersClient = createServerFunctionClient<typeof ServerListUsers>(listUsers).pipe(craftClientMiddleware(session));
      `,
    });

    expect(graph.handshakes().map((node) => node.label).sort()).toEqual([
      'users.list',
      'users.session',
    ]);
    // L'identité de la famille vient du handshake, des deux côtés.
    expect(graph.serverFunctionFamilies().map((node) => node.label)).toEqual([
      'users.list',
    ]);
    expect(craftHandshakeViolations(graph.graph)).toEqual([]);
    // Et le facade n'a plus besoin de craftUnique : le handshake tient le rôle.
    expect(serverFunctionArchitectureViolations(graph.graph)).toEqual([]);
  });

  it('exige que le handshake soit attaché sur la façade de la même famille', async () => {
    const files = (attach: string) => ({
      'users/list.handshake.ts': `
        declare function craftHandshake<N extends string>(name: N, schema?: unknown): N;
        declare const Schema: { Struct(value: unknown): unknown; String: unknown };
        export const listUsers = craftHandshake('users.list');
        export const sessionShape = craftHandshake('users.session', Schema.Struct({ userId: Schema.String }));
      `,
      'users/session.mw-serveur.ts': `
        import { sessionShape } from './list.handshake';
        declare function craftMiddleware(id: string): { clientContext(value: unknown): any; server(value: unknown): unknown };
        export const claimedUser = craftMiddleware('demo.claimed-user').clientContext(sessionShape).server(({ clientContext }: any) => clientContext.userId);
      `,
      'users/session.mw-client.ts': `
        import { sessionShape } from './list.handshake';
        declare function craftHandshakeMiddleware(handshake: unknown, run: unknown): unknown;
        export const sessionContext = craftHandshakeMiddleware(sessionShape, function* () {
          return { userId: 'u-1' };
        });
      `,
      'users/list.fn-serveur.ts': `
        import { listUsers } from './list.handshake';
        import { claimedUser } from './session.mw-serveur';
        declare function serverFunction(...values: unknown[]): { use(value: unknown): any; handler(value: unknown): unknown };
        export const listUsersFn = serverFunction(listUsers, {}, { exposure: 'client' }).use(claimedUser).handler(() => 1);
      `,
      'users/list.fn-client.ts': `
        import { listUsers } from './list.handshake';
        import { sessionContext } from './session.mw-client';
        import type { listUsersFn as ServerListUsers } from './list.fn-serveur';
        declare function craftClientMiddleware(...values: unknown[]): unknown;
        declare function createServerFunctionClient<T>(id: unknown): { pipe(value: unknown): unknown };
        void sessionContext;
        export const listUsersClient = createServerFunctionClient<typeof ServerListUsers>(listUsers).pipe(craftClientMiddleware(${attach}));
      `,
    });

    // Attaché : la chaîne serveur reçoit ce qu'elle attend.
    const honoured = await graphOf(files('sessionContext'));
    expect(serverFunctionArchitectureViolations(honoured.graph)).toEqual([]);
    expect(craftHandshakeViolations(honoured.graph)).toEqual([]);

    // Le middleware existe et le handshake est bien tenu des deux côtés — mais
    // la façade ne l'attache pas. Seule la règle par famille peut le voir.
    const detached = await graphOf(files(''));
    expect(craftHandshakeViolations(detached.graph)).toEqual([]);
    expect(
      serverFunctionArchitectureViolations(detached.graph).map(
        (violation) => violation.code,
      ),
    ).toEqual(['CRAFT_SERVER_FUNCTION_HANDSHAKE_NOT_ATTACHED']);
  });

  it('signale un handshake sans pendant, non statique, ou déclaré deux fois', async () => {
    const graph = await graphOf({
      'users/orphan.handshake.ts': `
        declare function craftHandshake<N extends string>(name: N): N;
        declare const dynamic: string;
        export const serverOnly = craftHandshake('users.server-only');
        export const clientOnly = craftHandshake('users.client-only');
        export const unnamed = craftHandshake(dynamic as 'x');
        export const twinA = craftHandshake('users.twin');
      `,
      'users/other.handshake.ts': `
        declare function craftHandshake<N extends string>(name: N): N;
        export const twinB = craftHandshake('users.twin');
      `,
      'users/orphan.fn-serveur.ts': `
        import { serverOnly, twinA } from './orphan.handshake';
        import { twinB } from './other.handshake';
        declare function serverFunction(...values: unknown[]): { handler(value: unknown): unknown };
        export const orphanFn = serverFunction('users.orphan', {}, { exposure: 'client' }).handler(() => [serverOnly, twinA, twinB]);
      `,
      'users/orphan.fn-client.ts': `
        import { clientOnly, twinA } from './orphan.handshake';
        import { twinB } from './other.handshake';
        import type { orphanFn as ServerOrphan } from './orphan.fn-serveur';
        declare function craftUnique<T>(value: T): T;
        declare function createServerFunctionClient<T>(id: unknown): unknown;
        export const orphanClient = createServerFunctionClient<typeof ServerOrphan>(craftUnique('users.orphan'));
        void [clientOnly, twinA, twinB];
      `,
    });

    const violations = craftHandshakeViolations(graph.graph);
    expect(violations.map((violation) => violation.code).sort()).toEqual([
      'CRAFT_HANDSHAKE_DUPLICATE_NAME',
      'CRAFT_HANDSHAKE_MISSING_COUNTERPART',
      'CRAFT_HANDSHAKE_MISSING_COUNTERPART',
      'CRAFT_HANDSHAKE_NOT_STATIC',
    ]);
    // Le message nomme le côté manquant, dans les deux sens.
    expect(
      violations.find((violation) => violation.name === 'users.server-only')
        ?.message,
    ).toContain('has no client counterpart');
    expect(
      violations.find((violation) => violation.name === 'users.client-only')
        ?.message,
    ).toContain('has no server counterpart');
    expect(() => assertCraftHandshake(graph.graph)).toThrow(
      /CRAFT_HANDSHAKE_MISSING_COUNTERPART/,
    );
  });

  it('flags a serverFunction(...) defined outside a *.fn-serveur.ts file', async () => {
    const graph = await graphOf({
      'users/list.service.ts': `
        declare function serverFunction(...values: unknown[]): { handler(value: unknown): unknown };
        export const listUsers = serverFunction('users.list', {}).handler(() => ({ ok: true }));
      `,
    });

    expect(
      serverFunctionArchitectureViolations(graph.graph).map(
        (violation) => violation.code,
      ),
    ).toContain('CRAFT_SERVER_FUNCTION_NAMING_CONVENTION_MISSING');
    expect(() => assertServerFunctionArchitecture(graph.graph)).toThrow(
      /CRAFT_SERVER_FUNCTION_NAMING_CONVENTION_MISSING/,
    );
  });
});

describe('resource loader requirements', () => {
  it('requires query and mutation loaders to reach HTTP or a server function', async () => {
    const graph = await graphOf({
      'users/list.fn-serveur.ts': `
        declare function serverFunction(...values: unknown[]): { handler(value: unknown): unknown };
        export const listUsers = serverFunction('users.list', {}).handler(() => ({ ok: true }));
      `,
      'users/list.fn-client.ts': `
        declare function craftUnique<T>(value: T): T;
        declare function createServerFunctionClient<T>(value: string): unknown;
        import type { listUsers as ServerListUsers } from './list.fn-serveur';
        export const getUsers = createServerFunctionClient<typeof ServerListUsers>(craftUnique('users.list'));
      `,
      'app.ts': `
        ${STUBS}
        declare function createServerFunctionClient<T>(value: string): unknown;
        import { getUsers } from './users/list.fn-client';
        const { Data } = craftService(
          { name: 'Data', providedIn: 'global' },
          function* () {
            yield* query('httpUsers', {
              loader: function* () {
                return yield* CraftHttpClient.get(({ response }) => ({ url: 'users', success: response() }));
              },
            });
            yield* mutation('saveUsers', {
              method: (value: string) => value,
              loader: function* () {
                return yield* getUsers('all');
              },
            });
            yield* query('localUsers', {
              loader: () => Promise.resolve([]),
            });
            return {};
          },
        );
      `,
    });

    expect(
      graph.graph.edges.filter((edge) => edge.details?.['resourceRole'] === 'loader'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'calls', details: expect.objectContaining({ http: true }) }),
        expect.objectContaining({ kind: 'calls', details: expect.objectContaining({ serverFunction: true }) }),
      ]),
    );
    expect(queryMutationServerStateViolations(graph.graph).map((v) => v.label)).toEqual([
      'localUsers',
    ]);
    expect(() => assertQueryMutationHasServerState(graph.graph)).toThrow(
      /query localUsers loader must depend on CraftHttpClient or server function/,
    );
  });

  it('lets an application define different requirements for Effect resources', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}
        declare function queryEffect(...args: unknown[]): unknown;
        declare function mutationEffect(...args: unknown[]): unknown;
        declare function computedEffect<T>(name: string, factory: () => Effect.Effect<T, never, UserApi>): unknown;
        declare namespace Effect { interface Effect<A, E, R> {} }
        declare namespace Context { function Service<T, Shape>(): (name: string) => new (...args: never[]) => Shape; }
        class UserApi extends Context.Service<UserApi, {}>()('UserApi') {}
        declare function loadAccess(): Effect.Effect<string, never, UserApi>;
        const { Access } = craftService(
          { name: 'Access', providedIn: 'global' },
          function* () {
            yield* queryEffect('accessQuery', {
              loader: () => loadAccess(),
            });
            yield* mutationEffect('saveAccess', {
              method: (value: string) => value,
              loader: () => loadAccess(),
            });
            computedEffect('computedAccess', () => loadAccess());
            yield* queryEffect('localEffect', {
              loader: () => Promise.resolve('local'),
            });
            return {};
          },
        );
      `,
    });
    const requirements = {
      primitives: ['queryEffect', 'mutationEffect'],
      requirements: [
        {
          label: 'an Effect service',
          matches: ({ target }: LoaderRequirementContext) =>
            target.kind === 'service' && target.details?.['runtime'] === 'effect',
        },
      ],
    } as const;

    expect(primitiveLoaderRequirementViolations(graph.graph, requirements).map((v) => v.label)).toEqual([
      'localEffect',
    ]);
    expect(() => assertPrimitiveLoaderRequirements(graph.graph, requirements)).toThrow(
      /queryEffect localEffect loader must depend on an Effect service/,
    );
  });
});

describe('declarative architecture rules', () => {
  it('rejects the same HTTP verb+url called from two services', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        const { UsersApi } = craftService(
          { name: 'UsersApi', providedIn: 'global', browserBoundary: true },
          function* () {
            yield* CraftHttpClient.get(({ response }) => ({
              url: 'users',
              success: response(),
            }));
            return {};
          },
        );

        const { ProfileApi } = craftService(
          { name: 'ProfileApi', providedIn: 'global', browserBoundary: true },
          function* () {
            yield* CraftHttpClient.get(({ response }) => ({
              url: 'users',
              success: response(),
            }));
            return {};
          },
        );
      `,
    });

    const violations = httpEndpointUniqueViolations(graph.graph);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.label).toBe('GET users');
    expect(violations[0]?.callSites).toHaveLength(2);
    expect(() => assertHttpEndpointUnique(graph.graph)).toThrow(
      /GET users.*twice|Duplicate HTTP/i,
    );
    expect(() => assertDeclarativeArchitecture(graph.graph)).toThrow(
      /GET users/i,
    );
  });

  it('allows distinct HTTP verb+url pairs', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        const { UsersApi } = craftService(
          { name: 'UsersApi', providedIn: 'global', browserBoundary: true },
          function* () {
            yield* CraftHttpClient.get(({ response }) => ({
              url: 'users',
              success: response(),
            }));
            yield* CraftHttpClient.post(({ response }) => ({
              url: 'users',
              success: response(),
            }));
            yield* CraftHttpClient.get(({ response }) => ({
              url: 'orders',
              success: response(),
            }));
            return {};
          },
        );
      `,
    });

    expect(httpEndpointUniqueViolations(graph.graph)).toEqual([]);
    expect(() => assertHttpEndpointUnique(graph.graph)).not.toThrow();
  });

  it('rejects a craftComputed that calls a craftMethod', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        const { Counter } = craftService(
          { name: 'Counter', providedIn: 'global' },
          function* () {
            const bump = craftMethod('bump', function* () {
              return 1;
            });
            const label = craftComputed('label', function* () {
              yield* bump();
              return 1;
            });
            return { bump, label };
          },
        );
      `,
    });

    const violations = craftComputedPureViolations(graph.graph);
    expect(violations.some((violation) => violation.kind === 'calls')).toBe(
      true,
    );
    expect(() => assertCraftComputedPure(graph.graph)).toThrow(
      /craftComputed.*label|calls/i,
    );
  });

  it('rejects a craftComputed that writes a source$', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        const reset$ = source$<void>('reset$');

        const { Counter } = craftService(
          { name: 'Counter', providedIn: 'global' },
          function* () {
            const label = craftComputed('label', function* () {
              reset$.emit();
              return 1;
            });
            return { label };
          },
        );
      `,
    });

    const violations = craftComputedPureViolations(graph.graph);
    expect(violations.some((violation) => violation.kind === 'writes')).toBe(
      true,
    );
    expect(() => assertCraftComputedPure(graph.graph)).toThrow(
      /source\$|writes|emit/i,
    );
  });

  it('rejects a craftComputed that calls a mutating primitive method', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        const { Counter } = craftService(
          { name: 'Counter', providedIn: 'global' },
          function* () {
            const count = yield* state('count', 0);
            const label = craftComputed('label', function* () {
              yield* count.increment();
              return yield* count();
            });
            return { count, label };
          },
        );
      `,
    });

    expect(
      craftComputedPureViolations(graph.graph).some(
        (violation) => violation.kind === 'calls',
      ),
    ).toBe(true);
    expect(() => assertCraftComputedPure(graph.graph)).toThrow(/increment|calls/i);
  });

  it('allows a craftComputed that only reads reactive values', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        const { Counter } = craftService(
          { name: 'Counter', providedIn: 'global' },
          function* () {
            const count = yield* state('count', 0);
            const label = craftComputed('label', function* () {
              return (yield* count()) + 1;
            });
            return { count, label };
          },
        );
      `,
    });

    expect(craftComputedPureViolations(graph.graph)).toEqual([]);
    expect(() => assertCraftComputedPure(graph.graph)).not.toThrow();
  });

  it('rejects a depends-on cycle between two services', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        const { Left } = craftService(
          { name: 'Left', providedIn: 'global' },
          function* () {
            yield* Right();
            return {};
          },
        );

        const { Right } = craftService(
          { name: 'Right', providedIn: 'global' },
          function* () {
            yield* Left();
            return {};
          },
        );
      `,
    });

    const cycles = dependencyCycleViolations(graph.graph);
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[0]?.labels).toEqual(expect.arrayContaining(['Left', 'Right']));
    expect(() => assertNoDependencyCycles(graph.graph)).toThrow(
      /cycle|Left|Right/i,
    );
  });

  it('rejects a three-service depends-on cycle', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        const { A } = craftService(
          { name: 'A', providedIn: 'global' },
          function* () {
            yield* B();
            return {};
          },
        );
        const { B } = craftService(
          { name: 'B', providedIn: 'global' },
          function* () {
            yield* C();
            return {};
          },
        );
        const { C } = craftService(
          { name: 'C', providedIn: 'global' },
          function* () {
            yield* A();
            return {};
          },
        );
      `,
    });

    expect(dependencyCycleViolations(graph.graph)[0]?.labels).toEqual(
      expect.arrayContaining(['A', 'B', 'C']),
    );
    expect(() => assertNoDependencyCycles(graph.graph)).toThrow(/A|B|C|cycle/i);
  });

  it('rejects a depends-on cycle between two craftComputed nodes', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        const { Counter } = craftService(
          { name: 'Counter', providedIn: 'global' },
          function* () {
            const left = craftComputed('left', function* () {
              return yield* right();
            });
            const right = craftComputed('right', function* () {
              return yield* left();
            });
            return { left, right };
          },
        );
      `,
    });

    expect(
      dependencyCycleViolations(graph.graph)[0]?.labels.join(' '),
    ).toMatch(/left|right/i);
    expect(() => assertNoDependencyCycles(graph.graph)).toThrow(/cycle/i);
  });

  it('allows a shared kernel without a depends-on cycle', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        const { Auth } = craftService(
          { name: 'Auth', providedIn: 'global' },
          () => ({}),
        );

        const { Left } = craftService(
          { name: 'Left', providedIn: 'global' },
          function* () {
            yield* Auth();
            return {};
          },
        );

        const { Right } = craftService(
          { name: 'Right', providedIn: 'global' },
          function* () {
            yield* Auth();
            return {};
          },
        );
      `,
    });

    expect(dependencyCycleViolations(graph.graph)).toEqual([]);
    expect(() => assertNoDependencyCycles(graph.graph)).not.toThrow();
    expect(() => assertDeclarativeArchitecture(graph.graph)).not.toThrow();
  });
});

describe('assertPathBoundaries', () => {
  const featureConstraints = [
    {
      source: 'src/app/features/:feature/**',
      onlyDependOn: [
        'src/app/features/:feature/**',
        'src/app/shared/**',
        'src/app/ui/**',
      ],
    },
  ];

  async function layeredGraph() {
    return graphOf({
      'src/app/shared/auth.ts': `
        ${STUBS}
        export const { Auth } = craftService(
          { name: 'Auth', providedIn: 'global' },
          () => ({}),
        );
      `,
      'src/app/features/cart/cart.ts': `
        ${STUBS}
        export const { Cart } = craftService(
          { name: 'Cart', providedIn: 'global' },
          () => ({}),
        );
      `,
      'src/app/features/users/users.ts': `
        ${STUBS}
        import { Auth } from '../../shared/auth';
        import { Cart } from '../cart/cart';
        export const { Users } = craftService(
          { name: 'Users', providedIn: 'global' },
          function* () {
            yield* Auth();
            yield* Cart();
            return {};
          },
        );
      `,
      'src/app/ui/widget.ts': `
        ${STUBS}
        import { Auth } from '../shared/auth';
        export const { Widget } = craftService(
          { name: 'Widget', providedIn: 'global' },
          function* () {
            yield* Auth();
            return {};
          },
        );
      `,
      'src/app/data/users-api.ts': `
        ${STUBS}
        export const { UsersApi } = craftService(
          { name: 'UsersApi', providedIn: 'global', browserBoundary: true },
          () => ({}),
        );
      `,
      'src/app/ui/leaky.ts': `
        ${STUBS}
        import { UsersApi } from '../data/users-api';
        export const { LeakyWidget } = craftService(
          { name: 'LeakyWidget', providedIn: 'global' },
          function* () {
            yield* UsersApi();
            return {};
          },
        );
      `,
    });
  }

  it('rejects a feature that depends on another feature', async () => {
    const graph = await layeredGraph();
    const violations = pathBoundaryViolations(graph.graph, {
      constraints: featureConstraints,
    });
    expect(violations.some((violation) => violation.reason === 'allowlist')).toBe(
      true,
    );
    expect(violations.map((violation) => violation.toLabel)).toContain('Cart');
    expect(() =>
      assertPathBoundaries(graph.graph, { constraints: featureConstraints }),
    ).toThrow(/Path boundary:.*Users.*Cart/s);
  });

  it('allows a feature to depend on shared and on itself', async () => {
    const graph = await graphOf({
      'src/app/shared/auth.ts': `
        ${STUBS}
        export const { Auth } = craftService(
          { name: 'Auth', providedIn: 'global' },
          () => ({}),
        );
      `,
      'src/app/features/users/profile.ts': `
        ${STUBS}
        export const { Profile } = craftService(
          { name: 'Profile', providedIn: 'global' },
          () => ({}),
        );
      `,
      'src/app/features/users/users.ts': `
        ${STUBS}
        import { Auth } from '../../shared/auth';
        import { Profile } from './profile';
        export const { Users } = craftService(
          { name: 'Users', providedIn: 'global' },
          function* () {
            yield* Auth();
            yield* Profile();
            return {};
          },
        );
      `,
    });

    expect(
      pathBoundaryViolations(graph.graph, { constraints: featureConstraints }),
    ).toEqual([]);
    expect(() =>
      assertPathBoundaries(graph.graph, { constraints: featureConstraints }),
    ).not.toThrow();
  });

  it('rejects a UI node that depends on a denylisted data path', async () => {
    const graph = await layeredGraph();
    const constraints = [
      {
        source: 'src/app/ui/**',
        forbidTarget: ['src/app/data/**'],
      },
    ];
    expect(() =>
      assertPathBoundaries(graph.graph, { constraints }),
    ).toThrow(/Path boundary:.*LeakyWidget.*UsersApi/s);
  });

  it('allows UI to depend on shared while still forbidding data', async () => {
    const graph = await graphOf({
      'src/app/shared/auth.ts': `
        ${STUBS}
        export const { Auth } = craftService(
          { name: 'Auth', providedIn: 'global' },
          () => ({}),
        );
      `,
      'src/app/ui/widget.ts': `
        ${STUBS}
        import { Auth } from '../shared/auth';
        export const { Widget } = craftService(
          { name: 'Widget', providedIn: 'global' },
          function* () {
            yield* Auth();
            return {};
          },
        );
      `,
    });

    expect(() =>
      assertPathBoundaries(graph.graph, {
        constraints: [
          {
            source: 'src/app/ui/**',
            onlyDependOn: ['src/app/ui/**', 'src/app/shared/**'],
            forbidTarget: ['src/app/data/**', 'src/app/shared/legacy/**'],
          },
        ],
      }),
    ).not.toThrow();
  });

  it('does not constrain nodes whose path matches no source', async () => {
    const graph = await layeredGraph();
    expect(() =>
      assertPathBoundaries(graph.graph, {
        constraints: [
          {
            source: 'src/app/playground/**',
            onlyDependOn: ['src/app/playground/**'],
          },
        ],
      }),
    ).not.toThrow();
  });

  it('rejects every dependency when onlyDependOn is empty', async () => {
    const graph = await graphOf({
      'src/app/ui/widget.ts': `
        ${STUBS}
        import { Auth } from '../shared/auth';
        export const { Widget } = craftService(
          { name: 'Widget', providedIn: 'global' },
          function* () {
            yield* Auth();
            return {};
          },
        );
      `,
      'src/app/shared/auth.ts': `
        ${STUBS}
        export const { Auth } = craftService(
          { name: 'Auth', providedIn: 'global' },
          () => ({}),
        );
      `,
    });

    expect(() =>
      assertPathBoundaries(graph.graph, {
        constraints: [{ source: 'src/app/ui/**', onlyDependOn: [] }],
      }),
    ).toThrow(/Path boundary/);
  });

  it('ignores provides and loads by default', async () => {
    const graph = await graphOf({
      'src/app/features/users/users.ts': `
        ${STUBS}
        export const { Users, provideUsers } = craftService(
          { name: 'Users', providedIn: 'toProvide' },
          () => ({}),
        );
      `,
      'src/app/app.routes.ts': `
        ${STUBS}
        import { provideUsers } from './features/users/users';
        export const appRoutes = craftRoutes('appRoutes', [
          craftRoute('/users', {
            path: '/users',
            providers: [provideUsers()],
          }),
        ]);
      `,
    });

    expect(() =>
      assertPathBoundaries(graph.graph, {
        constraints: [
          {
            source: 'src/app/**',
            onlyDependOn: ['src/app/app.routes.ts'],
          },
        ],
      }),
    ).not.toThrow();
  });
});

const ROUTE_STUBS = `
${STUBS}
declare function loadCraftComponent(...args: unknown[]): object;
declare function assertExhaustiveRouteExceptions(routes: unknown): void;
type CanRun<T> = T;
type ValidateCascadeRoutesFile<A, B, C> = true;
type RouteCheckedDI<A, B = never, C = unknown, D = string, E = never> = true;
type RouteExceptionComponentCheckedDI<A, B = never, C = unknown, D = string> = true;
type ComponentDepsOf<T> = T;
`;

describe('route DI proofs', () => {
  it('rejects a component route with no CanRun proof', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${ROUTE_STUBS}
        export const { appRoutes } = craftRoutes('app', [
          {
            path: 'users',
            ...loadCraftComponent(() => import('./users')),
          },
        ]);
      `,
      'users.ts': `
        ${STUBS}
        export const users = craftComponent('Users', {}, function* () {
          return {};
        }, () => div());
      `,
    });

    const violations = routeDiProofViolations(graph.graph);
    expect(violations.map((violation) => violation.kind)).toContain(
      'missing-di-proof',
    );
    expect(() => assertRouteDiProofs(graph.graph)).toThrow(/users/i);
  });

  it('accepts a cascade mapper armed with CanRun and an exception assert', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${ROUTE_STUBS}
        export const { appRoutes } = craftRoutes('app', [
          {
            path: 'users',
            ...loadCraftComponent(() => import('./users')),
          },
        ]);
        assertExhaustiveRouteExceptions(appRoutes);
        type _CheckAppDI = ValidateCascadeRoutesFile<never, unknown, typeof appRoutes>;
        type _CanRunApp = CanRun<_CheckAppDI>;
      `,
      'users.ts': `
        ${STUBS}
        export const users = craftComponent('Users', {}, function* () {
          return {};
        }, () => div());
      `,
    });

    expect(routeDiProofViolations(graph.graph)).toEqual([]);
    expect(() => assertRouteDiProofs(graph.graph)).not.toThrow();
    const users = graph.route('users');
    expect(
      users
        .incoming('checks')
        .map((edge) => graph.graph.nodes.find((node) => node.id === edge.from)?.details?.['mechanism']),
    ).toEqual(
      expect.arrayContaining([
        'ValidateCascadeRoutesFile',
        'assertExhaustiveRouteExceptions',
      ]),
    );
  });

  it('rejects a cascade mapper that is not armed with CanRun', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${ROUTE_STUBS}
        export const { appRoutes } = craftRoutes('app', [
          {
            path: 'users',
            ...loadCraftComponent(() => import('./users')),
          },
        ]);
        assertExhaustiveRouteExceptions(appRoutes);
        type _CheckAppDI = ValidateCascadeRoutesFile<never, unknown, typeof appRoutes>;
      `,
      'users.ts': `
        ${STUBS}
        export const users = craftComponent('Users', {}, function* () {
          return {};
        }, () => div());
      `,
    });

    expect(routeDiProofViolations(graph.graph).map((violation) => violation.kind)).toContain(
      'unarmed-mapper',
    );
    expect(() => assertRouteDiProofs(graph.graph)).toThrow(/not armed with CanRun/i);
  });

  it('follows a type alias wrapping RouteCheckedDI', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${ROUTE_STUBS}
        type DemoRouteCheckedDI<
          Component,
          RouteInputs extends string = never,
          Context extends string = 'demo',
        > = RouteCheckedDI<ComponentDepsOf<Component>, never, unknown, Context, RouteInputs>;
        export const { appRoutes } = craftRoutes('app', [
          {
            path: 'users',
            ...loadCraftComponent(() => import('./users')),
          },
        ]);
        assertExhaustiveRouteExceptions(appRoutes);
        type _CanRunUsers = CanRun<
          DemoRouteCheckedDI<
            (typeof import('./users'))['users'],
            never,
            'path: "users"'
          >
        >;
      `,
      'users.ts': `
        ${STUBS}
        export const users = craftComponent('Users', {}, function* () {
          return {};
        }, () => div());
      `,
    });

    expect(routeDiProofViolations(graph.graph)).toEqual([]);
    expect(() => assertRouteDiProofs(graph.graph)).not.toThrow();
  });

  it('does not let a parent collection cover a loadChildren child', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${ROUTE_STUBS}
        export const { appRoutes } = craftRoutes('app', [
          {
            path: 'admin',
            loadChildren: () => import('./admin.routes').then((module) => module.adminRoutes),
          },
        ]);
        assertExhaustiveRouteExceptions(appRoutes);
        type _CheckAppDI = ValidateCascadeRoutesFile<never, unknown, typeof appRoutes>;
        type _CanRunApp = CanRun<_CheckAppDI>;
      `,
      'admin.routes.ts': `
        ${ROUTE_STUBS}
        export const { adminRoutes } = craftRoutes('admin', [
          {
            path: 'users',
            ...loadCraftComponent(() => import('./users')),
          },
        ]);
      `,
      'users.ts': `
        ${STUBS}
        export const users = craftComponent('Users', {}, function* () {
          return {};
        }, () => div());
      `,
    });

    const violations = routeDiProofViolations(graph.graph);
    expect(violations.map((violation) => violation.kind)).toEqual(
      expect.arrayContaining(['missing-di-proof', 'missing-exception-assert']),
    );
    expect(violations.some((violation) => violation.label === 'users')).toBe(true);
  });

  it('accepts a lazy child collection that carries its own proofs', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${ROUTE_STUBS}
        export const { appRoutes } = craftRoutes('app', [
          {
            path: 'admin',
            loadChildren: () => import('./admin.routes').then((module) => module.adminRoutes),
          },
        ]);
        assertExhaustiveRouteExceptions(appRoutes);
        type _CheckAppDI = ValidateCascadeRoutesFile<never, unknown, typeof appRoutes>;
        type _CanRunApp = CanRun<_CheckAppDI>;
      `,
      'admin.routes.ts': `
        ${ROUTE_STUBS}
        export const { adminRoutes } = craftRoutes('admin', [
          {
            path: 'users',
            ...loadCraftComponent(() => import('./users')),
          },
        ]);
        assertExhaustiveRouteExceptions(adminRoutes);
        type _CheckAdminDI = ValidateCascadeRoutesFile<never, unknown, typeof adminRoutes>;
        type _CanRunAdmin = CanRun<_CheckAdminDI>;
      `,
      'users.ts': `
        ${STUBS}
        export const users = craftComponent('Users', {}, function* () {
          return {};
        }, () => div());
      `,
    });

    expect(routeDiProofViolations(graph.graph)).toEqual([]);
    expect(() => assertRouteDiProofs(graph.graph)).not.toThrow();
  });

  it('requires a pending-component RouteCheckedDI in addition to the target proof', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${ROUTE_STUBS}
        export const { appRoutes } = craftRoutes('app', [
          {
            path: 'users',
            pendingComponent: () => import('./skeleton'),
            ...loadCraftComponent(() => import('./users')),
          },
        ]);
        assertExhaustiveRouteExceptions(appRoutes);
        type _CheckAppDI = ValidateCascadeRoutesFile<never, unknown, typeof appRoutes>;
        type _CanRunApp = CanRun<_CheckAppDI>;
      `,
      'users.ts': `
        ${STUBS}
        export const users = craftComponent('Users', {}, function* () {
          return {};
        }, () => div());
      `,
      'skeleton.ts': `
        ${STUBS}
        export const skeleton = craftComponent('Skeleton', {}, function* () {
          return {};
        }, () => div());
      `,
    });

    expect(
      routeDiProofViolations(graph.graph).map((violation) => violation.kind),
    ).toContain('missing-pending-proof');
  });

  it('accepts an armed pending-component RouteCheckedDI', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${ROUTE_STUBS}
        export const { appRoutes } = craftRoutes('app', [
          {
            path: 'users',
            pendingComponent: () => import('./skeleton'),
            ...loadCraftComponent(() => import('./users')),
          },
        ]);
        assertExhaustiveRouteExceptions(appRoutes);
        type _CheckAppDI = ValidateCascadeRoutesFile<never, unknown, typeof appRoutes>;
        type _CanRunApp = CanRun<_CheckAppDI>;
        type _CheckPendingDI = RouteCheckedDI<
          ComponentDepsOf<(typeof import('./skeleton'))['skeleton']>,
          never,
          unknown,
          'pending component: users'
        >;
        type _CanRunPending = CanRun<_CheckPendingDI>;
      `,
      'users.ts': `
        ${STUBS}
        export const users = craftComponent('Users', {}, function* () {
          return {};
        }, () => div());
      `,
      'skeleton.ts': `
        ${STUBS}
        export const skeleton = craftComponent('Skeleton', {}, function* () {
          return {};
        }, () => div());
      `,
    });

    expect(routeDiProofViolations(graph.graph)).toEqual([]);
    expect(() => assertRouteDiProofs(graph.graph)).not.toThrow();
  });

  it('requires an error-component proof when the route declares errorComponent', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${ROUTE_STUBS}
        export const { appRoutes } = craftRoutes('app', [
          {
            path: 'users',
            errorComponent: () => import('./error-screen'),
            ...loadCraftComponent(() => import('./users')),
          },
        ]);
        assertExhaustiveRouteExceptions(appRoutes);
        type _CheckAppDI = ValidateCascadeRoutesFile<never, unknown, typeof appRoutes>;
        type _CanRunApp = CanRun<_CheckAppDI>;
      `,
      'users.ts': `
        ${STUBS}
        export const users = craftComponent('Users', {}, function* () {
          return {};
        }, () => div());
      `,
      'error-screen.ts': `
        ${STUBS}
        export const errorScreen = craftComponent('ErrorScreen', {}, function* () {
          return {};
        }, () => div());
      `,
    });

    expect(
      routeDiProofViolations(graph.graph).map((violation) => violation.kind),
    ).toContain('missing-error-proof');
  });
});

const APP_CONFIG_STUBS = `
${ROUTE_STUBS}
declare function craftAppConfig(config: unknown): unknown;
declare function provideCraftGlobalErrorComponent(component: unknown): unknown;
declare function provideCraftRouteLoadErrorComponent(component: unknown): unknown;
declare function provideCraftRouter(...args: unknown[]): unknown;
declare function withErrorComponent(config: unknown): unknown;
declare function withRouteLoadError(config: unknown): unknown;
`;

describe('app config DI proofs', () => {
  it('rejects a global error screen registered without an armed CanRun', async () => {
    const graph = await graphOf({
      'app.config.ts': `
        ${APP_CONFIG_STUBS}
        export const ErrorScreen = craftComponent('ErrorScreen', {}, function* () {
          return {};
        }, () => div());
        export const appConfig = craftAppConfig({
          providers: [provideCraftGlobalErrorComponent(ErrorScreen)],
        });
      `,
    });

    expect(
      routeDiProofViolations(graph.graph).map((violation) => violation.kind),
    ).toContain('missing-global-error-proof');
    expect(() => assertRouteDiProofs(graph.graph)).toThrow(/global error/i);
  });

  it('rejects a route-load error screen registered without an armed CanRun', async () => {
    const graph = await graphOf({
      'app.config.ts': `
        ${APP_CONFIG_STUBS}
        export const LoadErrorScreen = craftComponent('LoadErrorScreen', {}, function* () {
          return {};
        }, () => div());
        export const appConfig = craftAppConfig({
          providers: [provideCraftRouteLoadErrorComponent(LoadErrorScreen)],
        });
      `,
    });

    expect(
      routeDiProofViolations(graph.graph).map((violation) => violation.kind),
    ).toContain('missing-route-load-error-proof');
    expect(() => assertRouteDiProofs(graph.graph)).toThrow(/route-load error/i);
  });

  it('accepts armed RouteExceptionComponentCheckedDI proofs next to craftAppConfig', async () => {
    const graph = await graphOf({
      'app.config.ts': `
        ${APP_CONFIG_STUBS}
        export const ErrorScreen = craftComponent('ErrorScreen', {}, function* () {
          return {};
        }, () => div());
        export const LoadErrorScreen = craftComponent('LoadErrorScreen', {}, function* () {
          return {};
        }, () => div());
        export const appConfig = craftAppConfig({
          providers: [
            provideCraftGlobalErrorComponent(ErrorScreen),
            provideCraftRouteLoadErrorComponent(LoadErrorScreen),
          ],
        });
        type _CheckGlobalErrorDI = RouteExceptionComponentCheckedDI<
          ComponentDepsOf<typeof ErrorScreen>,
          never,
          never,
          'global error component'
        >;
        type _CanRunGlobalError = CanRun<_CheckGlobalErrorDI>;
        type _CheckGlobalRouteLoadErrorDI = RouteExceptionComponentCheckedDI<
          ComponentDepsOf<typeof LoadErrorScreen>,
          never,
          never,
          'global route load error component'
        >;
        type _CanRunGlobalRouteLoadError = CanRun<_CheckGlobalRouteLoadErrorDI>;
      `,
    });

    expect(routeDiProofViolations(graph.graph)).toEqual([]);
    expect(() => assertRouteDiProofs(graph.graph)).not.toThrow();
  });

  it('does not require error proofs when craftAppConfig registers none', async () => {
    const graph = await graphOf({
      'app.config.ts': `
        ${APP_CONFIG_STUBS}
        export const appConfig = craftAppConfig({
          providers: [provideCraftRouter([])],
        });
      `,
    });

    expect(routeDiProofViolations(graph.graph)).toEqual([]);
  });
});

describe('insertion architecture rules', () => {
  it('rejects a mutation that no query reacts to', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        const { Users } = craftService(
          { name: 'Users', providedIn: 'global' },
          function* () {
            const save = yield* mutation('save', {});
            const user = yield* query('user', {});
            return { save, user };
          },
        );
      `,
    });

    expect(mutationReactOnViolations(graph.graph).map((item) => item.label)).toEqual(
      ['save'],
    );
    expect(() => assertMutationHasReactOn(graph.graph)).toThrow(
      /mutation save has no query reacting to it/i,
    );
    expect(() => assertDeclarativeArchitecture(graph.graph)).toThrow(
      /mutation save has no query reacting to it/i,
    );
  });

  it('accepts a mutation that a query reacts to, and an allowlisted orphan', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        const { Users } = craftService(
          { name: 'Users', providedIn: 'global' },
          function* () {
            const save = yield* mutation('save', {});
            const logout = yield* mutation('logout', {});
            const user = yield* query(
              'user',
              {},
              insertReactOnMutation(save, {}),
            );
            return { save, logout, user };
          },
        );
      `,
    });

    expect(mutationReactOnViolations(graph.graph, { allow: ['logout'] })).toEqual(
      [],
    );
    expect(() =>
      assertMutationHasReactOn(graph.graph, { allow: ['logout'] }),
    ).not.toThrow();
    expect(() =>
      assertDeclarativeArchitecture(graph.graph, { allow: ['logout'] }),
    ).not.toThrow();
  });

  it('rejects a persisted primitive whose identity is not craftUnique', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        const { Users } = craftService(
          { name: 'Users', providedIn: 'global' },
          function* () {
            const leaked = yield* query(
              'leaked',
              {},
              insertStoragePersister({ key: 'user', storeName: 'app' }),
            );
            return { leaked };
          },
        );
      `,
    });

    expect(
      persistedPrimitiveUniqueViolations(graph.graph).map((item) => item.label),
    ).toEqual(['leaked']);
    expect(() => assertPersistedPrimitiveHasUnique(graph.graph)).toThrow(
      /persisted query leaked is missing craftUnique/i,
    );
  });

  it('accepts a persisted primitive wrapped in craftUnique', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

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
      `,
    });

    expect(persistedPrimitiveUniqueViolations(graph.graph)).toEqual([]);
    expect(() => assertPersistedPrimitiveHasUnique(graph.graph)).not.toThrow();
  });

  it('rejects two insertSelect keys on the same host', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

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

    expect(insertSelectUniqueViolations(graph.graph)[0]?.key).toBe('cell');
    expect(() => assertInsertSelectUnique(graph.graph)).toThrow(
      /Duplicate insertSelect cell/i,
    );
  });

  it('allows the same insertSelect key on two different hosts', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        const { Grid } = craftService(
          { name: 'Grid', providedIn: 'global' },
          function* () {
            const left = yield* state('left', [], insertSelect('cell', () => ({})));
            const right = yield* state('right', [], insertSelect('cell', () => ({})));
            return { left, right };
          },
        );
      `,
    });

    expect(insertSelectUniqueViolations(graph.graph)).toEqual([]);
    expect(() => assertInsertSelectUnique(graph.graph)).not.toThrow();
  });

  it('rejects a craftEffect that calls HTTP', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

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

    expect(
      craftEffectNetworkViolations(graph.graph).some(
        (item) => item.kind === 'http',
      ),
    ).toBe(true);
    expect(() => assertCraftEffectNoNetwork(graph.graph)).toThrow(
      /craftEffect poll calls HTTP/i,
    );
  });

  it('rejects a craftEffect that calls a mutation', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

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

    expect(
      craftEffectNetworkViolations(graph.graph).some(
        (item) => item.kind === 'mutation',
      ),
    ).toBe(true);
    expect(() => assertCraftEffectNoNetwork(graph.graph)).toThrow(
      /craftEffect poll calls mutation/i,
    );
  });

  it('allows a craftEffect that only reads local state', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        const { Sync } = craftService(
          { name: 'Sync', providedIn: 'global' },
          function* () {
            const count = yield* state('count', 0);
            const poll = craftEffect('poll', function* () {
              return yield* count();
            });
            return { count, poll };
          },
        );
      `,
    });

    expect(craftEffectNetworkViolations(graph.graph)).toEqual([]);
    expect(() => assertCraftEffectNoNetwork(graph.graph)).not.toThrow();
  });
});

describe('assertCraftEffectNoImperativeSync', () => {
  it('rejects a craftEffect that writes a state', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        const { Sync } = craftService(
          { name: 'Sync', providedIn: 'global' },
          function* () {
            const selectedId = yield* state('selectedId', '1');
            const result = yield* state('result', null);
            const sync = craftEffect('sync', function* () {
              yield* result.set(yield* selectedId());
            });
            return { selectedId, result, sync };
          },
        );
      `,
    });

    expect(
      craftEffectImperativeSyncViolations(graph.graph).some(
        (item) => item.kind === 'state',
      ),
    ).toBe(true);
    expect(() => assertCraftEffectNoImperativeSync(graph.graph)).toThrow(
      /craftEffect sync writes state result/i,
    );
  });

  it('rejects a craftEffect that calls a query', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        const { Sync } = craftService(
          { name: 'Sync', providedIn: 'global' },
          function* () {
            const selectedId = yield* state('selectedId', '1');
            const usersQuery = yield* query('usersQuery', {});
            const sync = craftEffect('sync', function* () {
              yield* usersQuery.call(yield* selectedId());
            });
            return { selectedId, usersQuery, sync };
          },
        );
      `,
    });

    expect(() => assertCraftEffectNoImperativeSync(graph.graph)).toThrow(
      /craftEffect sync calls query usersQuery/i,
    );
  });

  it('rejects a craftEffect that emits a source$', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        const reset$ = source$<void>('reset$');

        const { Sync } = craftService(
          { name: 'Sync', providedIn: 'global' },
          function* () {
            const count = yield* state('count', 0);
            const sync = craftEffect('sync', function* () {
              if ((yield* count()) > 10) reset$.emit();
            });
            return { count, sync };
          },
        );
      `,
    });

    expect(() => assertCraftEffectNoImperativeSync(graph.graph)).toThrow(
      /craftEffect sync writes source reset\$/i,
    );
  });

  it('rejects a craftEffect that mutates a resource', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        const { Sync } = craftService(
          { name: 'Sync', providedIn: 'global' },
          function* () {
            const save = yield* mutation('save', {});
            const sync = craftEffect('sync', function* () {
              yield* save.mutate('payload');
            });
            return { save, sync };
          },
        );
      `,
    });

    expect(() => assertCraftEffectNoImperativeSync(graph.graph)).toThrow(
      /craftEffect sync calls mutation save/i,
    );
  });

  it('rejects a craftEffect that calls asyncProcess.method', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        const { Sync } = craftService(
          { name: 'Sync', providedIn: 'global' },
          function* () {
            const validate = yield* asyncProcess('validate', {});
            const sync = craftEffect('sync', function* () {
              yield* validate.method('payload');
            });
            return { validate, sync };
          },
        );
      `,
    });

    expect(() => assertCraftEffectNoImperativeSync(graph.graph)).toThrow(
      /craftEffect sync calls asyncProcess validate/i,
    );
  });

  it('allows a craftEffect that only reads local state', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        const { Sync } = craftService(
          { name: 'Sync', providedIn: 'global' },
          function* () {
            const count = yield* state('count', 0);
            const log = craftEffect('log', function* () {
              return yield* count();
            });
            return { count, log };
          },
        );
      `,
    });

    expect(craftEffectImperativeSyncViolations(graph.graph)).toEqual([]);
    expect(() => assertCraftEffectNoImperativeSync(graph.graph)).not.toThrow();
  });

  it('allows a craftEffect that only reads a query', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        const { Sync } = craftService(
          { name: 'Sync', providedIn: 'global' },
          function* () {
            const usersQuery = yield* query('usersQuery', {});
            const log = craftEffect('log', function* () {
              return yield* usersQuery();
            });
            return { usersQuery, log };
          },
        );
      `,
    });

    expect(craftEffectImperativeSyncViolations(graph.graph)).toEqual([]);
    expect(() => assertCraftEffectNoImperativeSync(graph.graph)).not.toThrow();
  });
});

describe('assertInteractiveElementNamed', () => {
  it('rejects an interactive helper without a literal local name', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        export const Counter = craftComponent(
          'Counter',
          {},
          () => ({}),
          () => button({ click() {} }, '+'),
        );
      `,
    });

    expect(interactiveElementNamedViolations(graph.graph)[0]?.kind).toBe(
      'missing',
    );
    expect(() => assertInteractiveElementNamed(graph.graph)).toThrow(
      /Interactive button is missing a literal data-craft-name/,
    );
  });

  it('rejects a non-static interactive local name', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        const name = 'increment';
        export const Counter = craftComponent(
          'Counter',
          {},
          () => ({}),
          () => button(name, {}, '+'),
        );
      `,
    });

    expect(interactiveElementNamedViolations(graph.graph)[0]?.kind).toBe(
      'non-static',
    );
    expect(() => assertInteractiveElementNamed(graph.graph)).toThrow(
      /Non-static interactive element name cannot be verified/,
    );
  });

  it('rejects the same data-craft-name used twice in the app', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        export const Login = craftComponent(
          'Login',
          {},
          () => ({}),
          () => button('save', { type: 'button' }, 'Save'),
        );

        export const Checkout = craftComponent(
          'Checkout',
          {},
          () => ({}),
          () => input('save', { type: 'text' }),
        );
      `,
    });

    expect(interactiveElementNamedViolations(graph.graph)[0]?.kind).toBe(
      'duplicate',
    );
    expect(interactiveElementNamedViolations(graph.graph)[0]?.label).toBe(
      'save',
    );
    expect(() => assertInteractiveElementNamed(graph.graph)).toThrow(
      /Duplicate data-craft-name "save" used twice/,
    );
  });

  it('accepts uniquely named interactive elements and skips hidden inputs', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        export const Login = craftComponent(
          'Login',
          {},
          () => ({}),
          () => [
            input('loginEmail', { type: 'email' }),
            input({ type: 'hidden', name: 'csrf' }),
            button('loginSubmit', { type: 'submit' }, 'Sign in'),
            span('hint'),
          ],
        );
      `,
    });

    expect(interactiveElementNamedViolations(graph.graph)).toEqual([]);
    expect(() => assertInteractiveElementNamed(graph.graph)).not.toThrow();
  });

  it('requires a name on a non-interactive tag that has a click handler', async () => {
    const graph = await graphOf({
      'app.ts': `
        ${STUBS}

        export const Card = craftComponent(
          'Card',
          {},
          () => ({}),
          () => div({ click() {} }, 'Open'),
        );
      `,
    });

    expect(interactiveElementNamedViolations(graph.graph)[0]?.kind).toBe(
      'missing',
    );
    expect(() => assertInteractiveElementNamed(graph.graph)).toThrow(
      /Interactive div is missing a literal data-craft-name/,
    );
  });
});
