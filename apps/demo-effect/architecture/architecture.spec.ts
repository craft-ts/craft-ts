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
  assertResourceParamsPreferQueryParams,
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
    expect(graph.route('effect-function').kind).toBe('route');
    expect(graph.route('team').kind).toBe('route');
    expect(graph.service('AccessPolicyService').kind).toBe('service');
    expect(graph.service('TeamContextService').kind).toBe('service');
  });

  it('indexes standalone Effect operations, their services, and static Layers', () => {
    expect(
      graph.nodes('effect-operation').map((node) => node.label),
    ).toEqual(expect.arrayContaining(['checkUserAccess', 'loadTeamOverview']));
    expect(
      graph.nodes('effect-layer').map((node) => node.label),
    ).toEqual(
      expect.arrayContaining(['AccessPolicyLive', 'SessionLive', 'SupportTeamLive']),
    );

    const requiredServices = graph
      .edges('requires-service')
      .map((edge) => graph.graph.nodes.find((node) => node.id === edge.to)?.label)
      .filter((label): label is string => Boolean(label));
    expect(requiredServices).toEqual(
      expect.arrayContaining(['AccessPolicyService', 'SessionService', 'TeamContextService']),
    );

    const providedByLayer = graph.edges('provided-by-layer');
    expect(providedByLayer.length).toBeGreaterThanOrEqual(3);
    expect(
      providedByLayer.some((edge) =>
        edge.proof?.pattern?.includes('Layer provides AccessPolicyService'),
      ),
    ).toBe(true);
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
      primitives: ['queryEffect', 'computedEffect', 'mutationEffect'],
      requirements: [
        {
          label: 'an Effect service',
          matches: ({ target }) =>
            target.kind === 'service' && target.details?.['runtime'] === 'effect',
        },
      ],
      // The first two intentionally demonstrate a pure Effect value without an
      // injected service requirement. `receiptQuery` is a different case: its
      // Effect service, `I18nEffectService`, is declared by
      // `@craft-ts/i18n-effect` rather than by this application, so it can
      // never appear as a node of this app's graph. The route still proves the
      // requirement — through `EffectRequirementsCheckedDI` in app.routes.ts.
      allow: ['effectFunctionQuery', 'profileQuery', 'receiptQuery', 'weightLabel'],
    });
  });

  it('keeps resource params URL-backed unless intentionally local', () => {
    assertResourceParamsPreferQueryParams(graph.graph, {
      // These demos exercise process/runtime state rather than route filters:
      // locale selects the translation runtime and qty drives a member-sync
      // example.
      allow: [
        {
          name: 'locale',
          file: 'apps/demo-effect/src/app/examples/effect/effect-i18n.ts',
        },
        {
          name: 'qty',
          file: 'apps/demo-effect/src/app/examples/effect/effect-sync-members.ts',
        },
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

  it('keeps the Effect demo declarative', () => {
    assertDeclarativeArchitecture(graph.graph);
  });
});
