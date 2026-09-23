import { beforeAll, describe, it } from 'vitest';
import { assertNoUnusedPrimitiveMethods } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from '../load-graph';

describe('assertNoUnusedPrimitiveMethods', () => {
  let graph: Awaited<ReturnType<typeof loadArchitectureGraph>>;
  beforeAll(async () => {
    graph = await loadArchitectureGraph();
  }, 180_000);
  it('requires every exposed primitive method to be used', () => {
    assertNoUnusedPrimitiveMethods(graph.graph);
  });
});
