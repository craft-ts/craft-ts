import { beforeAll, describe, it } from 'vitest';
import { assertPersistedPrimitiveHasUnique } from '@craft-ng/dev-tools';
import { loadDemoArchitectureGraph } from '../load-graph';

describe('assertPersistedPrimitiveHasUnique', () => {
  let graph: ReturnType<typeof loadDemoArchitectureGraph>;

  beforeAll(() => {
    graph = loadDemoArchitectureGraph();
  }, 180_000);

  it('requires craftUnique on every persisted primitive', () => {
    assertPersistedPrimitiveHasUnique(graph.graph);
  });
});
