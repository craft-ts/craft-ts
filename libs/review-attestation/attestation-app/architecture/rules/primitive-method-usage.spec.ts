import { beforeAll, describe, it } from 'vitest';
import { assertPrimitiveMethodsUsedOnce } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from '../load-graph';

describe('assertPrimitiveMethodsUsedOnce', () => {
  let graph: Awaited<ReturnType<typeof loadArchitectureGraph>>;
  beforeAll(async () => {
    graph = await loadArchitectureGraph();
  }, 180_000);
  it('requires each exposed primitive method to have one call site', () => {
    assertPrimitiveMethodsUsedOnce(graph.graph);
  });
});
