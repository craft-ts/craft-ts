import { beforeAll, describe, expect, it } from 'vitest';
import {
  assertCraftComputedPure,
  assertCraftEffectNoImperativeSync,
  assertCraftEffectNoNetwork,
  assertDeclarativeArchitecture,
  assertInteractiveElementNamed,
  assertNoDependencyCycles,
  assertPrimitiveLoaderRequirements,
} from '@craft-ts/dev-tools/architecture-graph';
import { loadArchitectureGraph } from './load-graph';

describe('quickstart architecture', () => {
  let graph: ReturnType<typeof loadArchitectureGraph>;

  beforeAll(() => {
    graph = loadArchitectureGraph();
  }, 180_000);

  it('contains the Effect operation, service and Layer', () => {
    expect(graph.nodes('effect-operation').map((node) => node.label)).toEqual(
      expect.arrayContaining(['loadTask']),
    );
    expect(graph.nodes('effect-service').map((node) => node.label)).toEqual(
      expect.arrayContaining(['TaskRepositoryService']),
    );
    expect(graph.nodes('effect-layer').map((node) => node.label)).toEqual(
      expect.arrayContaining(['TaskRepositoryLive']),
    );
  });

  it('connects the operation to its service and Layer', () => {
    expect(
      graph.edges('requires-service').some((edge) =>
        graph.graph.nodes.find((node) => node.id === edge.to)?.label ===
          'TaskRepositoryService',
      ),
    ).toBe(true);
    expect(
      graph.edges('provided-by-layer').some((edge) =>
        graph.graph.nodes.find((node) => node.id === edge.to)?.label ===
          'TaskRepositoryLive',
      ),
    ).toBe(true);
  });

  it('requires Effect resources to declare a service boundary', () => {
    assertPrimitiveLoaderRequirements(graph.graph, {
      primitives: ['queryEffect', 'computedEffect', 'mutationEffect'],
      requirements: [
        {
          label: 'an Effect service',
          matches: ({ target }) =>
            target.kind === 'service' && target.details?.['runtime'] === 'effect',
        },
      ],
    });
  });

  it('keeps the starter app declarative and named', () => {
    assertCraftComputedPure(graph.graph);
    assertCraftEffectNoNetwork(graph.graph);
    assertCraftEffectNoImperativeSync(graph.graph);
    assertInteractiveElementNamed(graph.graph);
    assertNoDependencyCycles(graph.graph);
    assertDeclarativeArchitecture(graph.graph);
  });
});
