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
  assertPrimitiveLoaderRequirements,
  assertRouteDiProofs,
} from '@craft-ts/dev-tools/architecture-graph';
import { loadArchitectureGraph } from './load-graph';

/**
 * The graph is loaded once for the whole suite. Keep all graph assertions in
 * this file so Vitest does not rebuild the TypeScript graph in every worker.
 */
describe('architecture', () => {
  let graph: ReturnType<typeof loadArchitectureGraph>;

  beforeAll(() => {
    graph = loadArchitectureGraph();
  }, 180_000);

  it('loads the architecture graph', () => {
    expect(graph.graph.version).toBe(1);
  });

  it('indexes the Effect demo routes and services', () => {
    expect(graph.route('access').kind).toBe('route');
    expect(graph.route('team').kind).toBe('route');
    expect(graph.service('AccessPolicyService').kind).toBe('service');
    expect(graph.service('TeamContextService').kind).toBe('service');
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

  it('requires a query to react to each mutation', () => {
    assertMutationHasReactOn(graph.graph);
  });

  it('requires Effect resource loaders to declare an Effect service boundary', () => {
    assertPrimitiveLoaderRequirements(graph.graph, {
      primitives: ['queryEffect', 'mutationEffect'],
      requirements: [
        {
          label: 'an Effect service',
          matches: ({ target }) =>
            target.kind === 'service' && target.details?.['runtime'] === 'effect',
        },
      ],
      // This example intentionally demonstrates a pure Effect value without
      // an injected service requirement.
      allow: ['profileQuery'],
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

  it('keeps the Effect demo declarative', () => {
    assertDeclarativeArchitecture(graph.graph);
  });
});
