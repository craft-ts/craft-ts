import { beforeAll, describe, it } from 'vitest';
import { assertCraftUnique } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from '../load-graph';

describe('assertCraftUnique', () => {
  let graph: Awaited<ReturnType<typeof loadArchitectureGraph>>;
  beforeAll(async () => {
    graph = await loadArchitectureGraph();
  }, 180_000);
  it('requires craftUnique identities to appear once', () => {
    assertCraftUnique(graph.graph);
  });
});
