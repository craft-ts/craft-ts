import { beforeAll, describe, it } from 'vitest';
import { assertInsertSelectUnique } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from '../load-graph';

describe('assertInsertSelectUnique', () => {
  let graph: Awaited<ReturnType<typeof loadArchitectureGraph>>;
  beforeAll(async () => {
    graph = await loadArchitectureGraph();
  }, 180_000);
  it('keeps insertSelect keys unique on each host', () => {
    assertInsertSelectUnique(graph.graph);
  });
});
