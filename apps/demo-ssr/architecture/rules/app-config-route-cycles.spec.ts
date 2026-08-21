import { beforeAll, describe, it } from 'vitest';
import { assertNoAppConfigRouteCycles } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from '../load-graph';

describe('assertNoAppConfigRouteCycles', () => {
  let graph: ReturnType<typeof loadArchitectureGraph>;

  beforeAll(() => {
    graph = loadArchitectureGraph();
  }, 180_000);

  it('keeps app configuration and route modules acyclic', () => {
    assertNoAppConfigRouteCycles(graph.graph);
  });
});
