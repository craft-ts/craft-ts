import { beforeAll, describe, it } from 'vitest';
import { assertHttpEndpointUnique } from '@craft-ts/dev-tools';
import { loadDemoArchitectureGraph } from '../load-graph';

describe('assertHttpEndpointUnique', () => {
  let graph: ReturnType<typeof loadDemoArchitectureGraph>;

  beforeAll(() => {
    graph = loadDemoArchitectureGraph();
  }, 180_000);

  it('owns each HTTP endpoint once', () => {
    assertHttpEndpointUnique(graph.graph);
  });
});
