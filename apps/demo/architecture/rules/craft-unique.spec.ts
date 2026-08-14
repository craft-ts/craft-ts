import { beforeAll, describe, it } from 'vitest';
import { assertCraftUnique } from '@craft-ng/dev-tools';
import { loadDemoArchitectureGraph } from '../load-graph';

describe('assertCraftUnique', () => {
  let graph: ReturnType<typeof loadDemoArchitectureGraph>;

  beforeAll(() => {
    graph = loadDemoArchitectureGraph();
  }, 180_000);

  it('requires craftUnique identities to appear once', () => {
    assertCraftUnique(graph.graph);
  });
});
