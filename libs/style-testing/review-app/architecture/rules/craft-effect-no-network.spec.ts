import { beforeAll, describe, it } from 'vitest';
import { assertCraftEffectNoNetwork } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from '../load-graph';

describe('assertCraftEffectNoNetwork', () => {
  let graph: ReturnType<typeof loadArchitectureGraph>;
  beforeAll(() => {
    graph = loadArchitectureGraph();
  }, 180_000);
  it('keeps craftEffect off HTTP and mutations', () => {
    assertCraftEffectNoNetwork(graph.graph);
  });
});
