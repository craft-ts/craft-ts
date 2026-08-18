import { beforeAll, describe, it } from 'vitest';
import { assertCraftEffectNoImperativeSync } from '@craft-ts/dev-tools';
import { loadDemoArchitectureGraph } from '../load-graph';

describe('assertCraftEffectNoImperativeSync', () => {
  let graph: ReturnType<typeof loadDemoArchitectureGraph>;

  beforeAll(() => {
    graph = loadDemoArchitectureGraph();
  }, 180_000);

  it('keeps craftEffect from pushing into state, sources, queries or mutations', () => {
    assertCraftEffectNoImperativeSync(graph.graph);
  });
});
