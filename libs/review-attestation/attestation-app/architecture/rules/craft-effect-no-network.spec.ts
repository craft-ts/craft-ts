import { beforeAll, describe, it } from 'vitest';
import { assertCraftEffectNoNetwork } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from '../load-graph';

describe('assertCraftEffectNoNetwork', () => {
  let graph: Awaited<ReturnType<typeof loadArchitectureGraph>>;
  beforeAll(async () => {
    graph = await loadArchitectureGraph();
  }, 180_000);
  it('keeps craftEffect off HTTP and mutations', () => {
    assertCraftEffectNoNetwork(graph.graph);
  });
});
