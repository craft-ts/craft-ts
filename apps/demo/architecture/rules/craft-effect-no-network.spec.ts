import { beforeAll, describe, it } from 'vitest';
import { assertCraftEffectNoNetwork } from '@craft-ts/dev-tools';
import { loadDemoArchitectureGraph } from '../load-graph';

describe('assertCraftEffectNoNetwork', () => {
  let graph: ReturnType<typeof loadDemoArchitectureGraph>;

  beforeAll(() => {
    graph = loadDemoArchitectureGraph();
  }, 180_000);

  it('keeps craftEffect off HTTP and mutations', () => {
    assertCraftEffectNoNetwork(graph.graph);
  });
});
