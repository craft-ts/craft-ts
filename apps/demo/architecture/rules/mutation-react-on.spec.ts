import { beforeAll, describe, it } from 'vitest';
import { assertMutationHasReactOn } from '@craft-ts/dev-tools';
import { loadDemoArchitectureGraph } from '../load-graph';

describe('assertMutationHasReactOn', () => {
  let graph: ReturnType<typeof loadDemoArchitectureGraph>;

  beforeAll(() => {
    graph = loadDemoArchitectureGraph();
  }, 180_000);

  it('requires a query to react to each mutation, except pedagogical orphans', () => {
    assertMutationHasReactOn(graph.graph, {
      allow: ['addTodo', 'removeTodo', 'submitted', 'issue'],
    });
  });
});
