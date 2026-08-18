import { beforeAll, describe, it } from 'vitest';
import { assertDeclarativeArchitecture } from '@craft-ts/dev-tools';
import { loadDemoArchitectureGraph } from '../load-graph';

describe('assertDeclarativeArchitecture', () => {
  let graph: ReturnType<typeof loadDemoArchitectureGraph>;

  beforeAll(() => {
    graph = loadDemoArchitectureGraph();
  }, 180_000);

  it('keeps the app declarative', () => {
    assertDeclarativeArchitecture(graph.graph, {
      allow: ['addTodo', 'removeTodo', 'submitted', 'issue'],
    });
  });
});
