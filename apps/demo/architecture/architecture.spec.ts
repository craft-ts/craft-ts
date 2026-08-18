import { beforeAll, describe, expect, it } from 'vitest';
import {
  assertCraftComputedPure,
  assertCraftEffectNoImperativeSync,
  assertCraftEffectNoNetwork,
  assertCraftUnique,
  assertDeclarativeArchitecture,
  assertHttpEndpointUnique,
  assertInsertSelectUnique,
  assertInteractiveElementNamed,
  assertMutationHasReactOn,
  assertNoDependencyCycles,
  assertPersistedPrimitiveHasUnique,
  assertQueryMutationHasServerState,
  assertRouteDiProofs,
  noExclusiveLink,
} from '@craft-ts/dev-tools';
import { loadDemoArchitectureGraph } from './load-graph';

/**
 * The graph is loaded once for the whole suite. Keep all graph assertions in
 * this file so Vitest does not rebuild the TypeScript graph in every worker.
 * Run with `npx nx architecture demo`.
 */
describe('demo architecture', () => {
  let graph: ReturnType<typeof loadDemoArchitectureGraph>;

  beforeAll(() => {
    graph = loadDemoArchitectureGraph();
  }, 180_000);

  it('indexes demo routes and provided feature services', () => {
    expect(graph.route('craft/query/:userId').kind).toBe('route');
    expect(graph.route('craft/mutation/:userId').kind).toBe('route');
    expect(graph.providedOn('UserList').map((node) => node.label)).toEqual(
      expect.arrayContaining([expect.stringMatching(/ListWithPagination/)]),
    );
    expect(graph.providedOn('UserMutation').map((node) => node.label)).toEqual(
      expect.arrayContaining([expect.stringMatching(/Mutation/)]),
    );
  });

  it('indexes the users HTTP endpoint', () => {
    expect(graph.httpEndpoint('GET', 'users').label).toBe('GET users');
    expect(graph.usingHttp().map((node) => node.label)).toEqual(
      expect.arrayContaining(['UsersApiOnError']),
    );
  });

  it('looks up a persisted unique identity', () => {
    expect(
      graph.unique('{"key":"user-query","storeName":"demo-app"}').kind,
    ).toBe('unique');
  });

  it('requires craftUnique identities to appear once', () => {
    assertCraftUnique(graph.graph);
  });

  it('owns each HTTP endpoint once', () => {
    assertHttpEndpointUnique(graph.graph);
  });

  it('keeps craftComputed free of methods and source$ writes', () => {
    assertCraftComputedPure(graph.graph);
  });

  it('forbids depends-on cycles', () => {
    assertNoDependencyCycles(graph.graph);
  });

  it('requires a DI proof on every routed component and app-config error screen', () => {
    assertRouteDiProofs(graph.graph);
  });

  it('requires a query to react to each mutation, except pedagogical orphans', () => {
    assertMutationHasReactOn(graph.graph, {
      allow: ['addTodo', 'removeTodo', 'submitted', 'issue'],
    });
  });

  it('requires query and mutation loaders to use server state', () => {
    assertQueryMutationHasServerState(graph.graph, {
      allow: [
        'users',
        'issue',
        'user',
        'add',
        'remove',
        'todos',
        'updateUserName',
        'query',
        'userQuery',
        'addTodo',
        'removeTodo',
        'toggleTodo',
        'deleteTodo',
        'openLibrarySearch',
        'submitted',
        'usersQuery',
        'slowAccess',
        'slowReport',
        'viewTransitionAccess',
        'auth',
      ],
    });
  });

  it('requires craftUnique on every persisted primitive', () => {
    assertPersistedPrimitiveHasUnique(graph.graph);
  });

  it('keeps insertSelect keys unique on each host', () => {
    assertInsertSelectUnique(graph.graph);
  });

  it('keeps craftEffect off HTTP and mutations', () => {
    assertCraftEffectNoNetwork(graph.graph);
  });

  it('keeps craftEffect from pushing into state, sources, queries or mutations', () => {
    assertCraftEffectNoImperativeSync(graph.graph);
  });

  it('requires a unique literal data-craft-name on every interactive element', () => {
    assertInteractiveElementNamed(graph.graph);
  });

  it('keeps the app declarative', () => {
    assertDeclarativeArchitecture(graph.graph, {
      allow: ['addTodo', 'removeTodo', 'submitted', 'issue'],
    });
  });

  it('keeps exclusive feature branches from linking', () => {
    const [userList] = graph.providedOn('UserList');
    const [userMutation] = graph.providedOn('UserMutation');
    expect(userList).toBeDefined();
    expect(userMutation).toBeDefined();
    noExclusiveLink(userList, userMutation);
  });
});
