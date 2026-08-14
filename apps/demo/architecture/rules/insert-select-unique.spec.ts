import { beforeAll, describe, it } from 'vitest';
import { assertInsertSelectUnique } from '@craft-ng/dev-tools';
import { loadDemoArchitectureGraph } from '../load-graph';

describe('assertInsertSelectUnique', () => {
  let graph: ReturnType<typeof loadDemoArchitectureGraph>;

  beforeAll(() => {
    graph = loadDemoArchitectureGraph();
  }, 180_000);

  it('keeps insertSelect keys unique on each host', () => {
    assertInsertSelectUnique(graph.graph);
  });
});
