import { beforeAll, describe, it } from 'vitest';
import { assertCraftComputedPure } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from '../load-graph';

describe('assertCraftComputedPure', () => {
  let graph: Awaited<ReturnType<typeof loadArchitectureGraph>>;
  beforeAll(async () => {
    graph = await loadArchitectureGraph();
  }, 180_000);
  it('keeps craftComputed free of methods and source$ writes', () => {
    assertCraftComputedPure(graph.graph);
  });
});
