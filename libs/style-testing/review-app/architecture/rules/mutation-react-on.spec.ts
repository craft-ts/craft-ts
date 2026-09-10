import { beforeAll, describe, it } from 'vitest';
import { assertMutationHasReactOn } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from '../load-graph';

describe('assertMutationHasReactOn', () => {
  let graph: ReturnType<typeof loadArchitectureGraph>;
  beforeAll(() => {
    graph = loadArchitectureGraph();
  }, 180_000);
  it('requires a query to react to each mutation', () => {
    assertMutationHasReactOn(graph.graph);
  });
});
