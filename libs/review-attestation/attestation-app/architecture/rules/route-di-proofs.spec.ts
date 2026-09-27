import { beforeAll, describe, it } from 'vitest';
import { assertRouteDiProofs } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from '../load-graph';

describe('assertRouteDiProofs', () => {
  let graph: Awaited<ReturnType<typeof loadArchitectureGraph>>;
  beforeAll(async () => {
    graph = await loadArchitectureGraph();
  }, 180_000);
  it('requires a DI proof on every routed component and app-config error screen', () => {
    assertRouteDiProofs(graph.graph);
  });
});
