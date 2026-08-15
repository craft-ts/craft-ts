import { beforeAll, describe, it } from 'vitest';
import { assertCraftComputedPure } from '@craft-ng/dev-tools';
import { loadDemoArchitectureGraph } from '../load-graph';

describe('assertCraftComputedPure', () => {
  let graph: ReturnType<typeof loadDemoArchitectureGraph>;

  beforeAll(() => {
    graph = loadDemoArchitectureGraph();
  }, 180_000);

  it('keeps craftComputed free of methods and source$ writes', () => {
    assertCraftComputedPure(graph.graph);
  });
});
