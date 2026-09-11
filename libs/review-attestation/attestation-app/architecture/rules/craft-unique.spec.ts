import { beforeAll, describe, it } from 'vitest';
import { assertCraftUnique } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from '../load-graph';

describe('assertCraftUnique', () => {
  let graph: ReturnType<typeof loadArchitectureGraph>;
  beforeAll(() => {
    graph = loadArchitectureGraph();
  }, 180_000);
  it('requires craftUnique identities to appear once', () => {
    assertCraftUnique(graph.graph);
  });
});
