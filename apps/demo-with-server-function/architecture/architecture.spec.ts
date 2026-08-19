import { beforeAll, describe, expect, it } from 'vitest';
import {
  assertCraftComputedPure,
  assertCraftEffectNoImperativeSync,
  assertCraftEffectNoNetwork,
  assertCraftHandshake,
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
  assertServerFunctionArchitecture,
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

  it('indexes both server-function families and their client identities', () => {
    expect(graph.serverFunctionFamilies().map((node) => node.label)).toEqual([
      'demo.users.authenticated-list',
      'demo.users.list',
    ]);
    // Deux façons de nommer une famille, toutes deux vérifiées : `craftUnique`
    // pour la chaîne répétée des deux côtés, `craftHandshake` pour l'identité
    // partagée déclarée une seule fois.
    expect(graph.unique('"demo.users.list"').kind).toBe('unique');
    expect(
      graph
        .handshakes()
        .find((node) => node.label === 'demo.users.authenticated-list')?.kind,
    ).toBe('handshake');
  });

  it('links a server function to its Effect service requirement with proof', () => {
    const service = graph.nodes('effect-service').find(
      (node) => node.label === 'UserRepository',
    );
    expect(service).toBeDefined();
    const serverPart = graph.graph.nodes.find(
      (node) =>
        node.kind === 'server-function-server' &&
        node.details?.['serverFunctionId'] === 'demo.users.list',
    );
    expect(serverPart).toBeDefined();
    const requirement = graph.graph.edges.find(
      (edge) => edge.from === serverPart?.id && edge.to === service?.id,
    );
    expect(requirement).toMatchObject({
      kind: 'requires-service',
      proof: { pattern: 'yield* UserRepository' },
    });
  });

  it('models the server-function middleware chain', () => {
    expect(
      graph
        .serverFunctionMiddlewares()
        .map((node) => node.label)
        .sort(),
    ).toEqual(['demo.admin-only', 'demo.matching-user', 'demo.request-audit']);

    // matchingUser -> adminOnly, et la server function -> ses deux middleware.
    const uses = graph.graph.edges.filter(
      (edge) => edge.details?.['boundary'] === 'middleware-uses',
    );
    expect(uses).toHaveLength(3);
  });

  it('models the client middleware chain and where it is attached', () => {
    expect(
      graph
        .clientFunctionMiddlewares()
        .map((node) => node.label)
        .sort(),
    ).toEqual(['demo.request-context', 'demo.requested-by']);

    // requestContext -> requestedByContext.
    expect(
      graph.graph.edges.filter(
        (edge) => edge.details?.['boundary'] === 'client-middleware-uses',
      ),
    ).toHaveLength(1);
    // Et la façade client qui l'attache via clientContext([...]).
    const attached = graph.graph.edges.filter(
      (edge) => edge.details?.['boundary'] === 'client-middleware-attached',
    );
    expect(attached).toHaveLength(1);
    expect(
      attached[0]?.from.startsWith(
        'server-function-part:server-function-client:',
      ),
    ).toBe(true);
  });

  it('requires craftUnique identities to appear once', () => {
    assertCraftUnique(graph.graph);
  });

  it('honore chaque handshake des deux côtés de la frontière', () => {
    expect(
      graph
        .handshakes()
        .map((node) => node.label)
        .sort(),
    ).toEqual([
      'demo.request-locale',
      'demo.requested-by',
      'demo.users.authenticated-list',
    ]);
    assertCraftHandshake(graph.graph);
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
      // This query is a local DI-state bridge; usersQuery is the server-state
      // query and must satisfy the Effect service requirement.
      allow: ['currentUserQuery'],
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

  it('keeps the server-function demo declarative', () => {
    assertDeclarativeArchitecture(graph.graph);
  });

  it('keeps client and server files in valid server-function families', () => {
    assertServerFunctionArchitecture(graph.graph);
  });
});
