import { beforeAll, describe, it } from 'vitest';
import { assertRouteDiProofs } from '@craft-ng/dev-tools';
import { loadDemoArchitectureGraph } from '../load-graph';

describe('assertRouteDiProofs', () => {
  let graph: ReturnType<typeof loadDemoArchitectureGraph>;

  beforeAll(() => {
    graph = loadDemoArchitectureGraph();
  }, 180_000);

  it('requires a DI proof on every routed component and app-config error screen', () => {
    assertRouteDiProofs(graph.graph);
  });
});
