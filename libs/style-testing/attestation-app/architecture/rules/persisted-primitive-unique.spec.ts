import { beforeAll, describe, it } from 'vitest';
import { assertPersistedPrimitiveHasUnique } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from '../load-graph';

describe('assertPersistedPrimitiveHasUnique', () => {
  let graph: ReturnType<typeof loadArchitectureGraph>;
  beforeAll(() => {
    graph = loadArchitectureGraph();
  }, 180_000);
  it('requires craftUnique on every persisted primitive', () => {
    assertPersistedPrimitiveHasUnique(graph.graph);
  });
});
