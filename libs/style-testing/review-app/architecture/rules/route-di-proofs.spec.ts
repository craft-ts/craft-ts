import { beforeAll, describe, it } from 'vitest';
import { assertRouteDiProofs } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from '../load-graph';

describe('assertRouteDiProofs', () => {
  let graph: ReturnType<typeof loadArchitectureGraph>;
  beforeAll(() => {
    graph = loadArchitectureGraph();
  }, 180_000);
  it('requires a DI proof on every routed component and app-config error screen', () => {
    assertRouteDiProofs(graph.graph);
  });
});
