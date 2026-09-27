import { beforeAll, describe, it } from 'vitest';
import { assertHttpEndpointUnique } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from '../load-graph';

describe('assertHttpEndpointUnique', () => {
  let graph: Awaited<ReturnType<typeof loadArchitectureGraph>>;
  beforeAll(async () => {
    graph = await loadArchitectureGraph();
  }, 180_000);
  it('owns each HTTP endpoint once', () => {
    assertHttpEndpointUnique(graph.graph);
  });
});
