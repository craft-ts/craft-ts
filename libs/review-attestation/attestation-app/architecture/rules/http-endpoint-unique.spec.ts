import { beforeAll, describe, it } from 'vitest';
import { assertHttpEndpointUnique } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from '../load-graph';

describe('assertHttpEndpointUnique', () => {
  let graph: ReturnType<typeof loadArchitectureGraph>;
  beforeAll(() => {
    graph = loadArchitectureGraph();
  }, 180_000);
  it('owns each HTTP endpoint once', () => {
    assertHttpEndpointUnique(graph.graph);
  });
});
