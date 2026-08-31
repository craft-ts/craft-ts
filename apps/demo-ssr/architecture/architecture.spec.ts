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
  assertNoAppConfigRouteCycles,
  assertPersistedPrimitiveHasUnique,
  assertQueryMutationHasServerState,
  assertResourceParamsPreferQueryParams,
  assertRouteComponentsInSeparateFiles,
  assertRouteDiProofs,
} from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from './load-graph';

describe('demo-ssr architecture', () => {
  let graph: ReturnType<typeof loadArchitectureGraph>;

  beforeAll(() => {
    graph = loadArchitectureGraph();
  }, 180_000);

  it('loads the SSR routes and Craft components', () => {
    expect(graph.graph.version).toBe(1);
    expect(graph.route('data').kind).toBe('route');
    expect(graph.route('client-only').kind).toBe('route');
    expect(graph.component('SsrDataPage').kind).toBe('component');
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

  it('keeps app configuration and route modules acyclic', () => {
    assertNoAppConfigRouteCycles(graph.graph);
  });

  it('requires a DI proof on every routed component', () => {
    assertRouteDiProofs(graph.graph);
  });

  it('keeps each routed page in its own file outside the routing file', () => {
    assertRouteComponentsInSeparateFiles(graph.graph);
  });

  it('requires a query to react to each mutation', () => {
    assertMutationHasReactOn(graph.graph);
  });

  it('requires resource loaders to declare their server-state boundary', () => {
    assertQueryMutationHasServerState(graph.graph, {
      // These are deliberately local loaders: the SSR lab demonstrates the
      // renderer boundary itself rather than an HTTP/server-function client.
      allow: ['ssrData', 'deferredData', 'clientOnlyData'],
    });
  });

  it('keeps resource params URL-backed', () => {
    assertResourceParamsPreferQueryParams(graph.graph);
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

  it('keeps the SSR lab declarative', () => {
    assertDeclarativeArchitecture(graph.graph);
  });
});
