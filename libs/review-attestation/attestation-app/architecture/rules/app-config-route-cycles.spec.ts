import { beforeAll, describe, it } from 'vitest';
import { assertNoAppConfigRouteCycles } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from '../load-graph';

describe('assertNoAppConfigRouteCycles', () => {
  let graph: Awaited<ReturnType<typeof loadArchitectureGraph>>;
  beforeAll(async () => {
    graph = await loadArchitectureGraph();
  }, 180_000);
  it('keeps app configuration and route modules acyclic', () => {
    assertNoAppConfigRouteCycles(graph.graph);
  });
});
