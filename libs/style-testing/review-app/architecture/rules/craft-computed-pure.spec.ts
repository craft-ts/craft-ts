import { beforeAll, describe, it } from 'vitest';
import { assertCraftComputedPure } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from '../load-graph';

describe('assertCraftComputedPure', () => {
  let graph: ReturnType<typeof loadArchitectureGraph>;
  beforeAll(() => {
    graph = loadArchitectureGraph();
  }, 180_000);
  it('keeps craftComputed free of methods and source$ writes', () => {
    assertCraftComputedPure(graph.graph);
  });
});
