import { beforeAll, describe, it } from 'vitest';
import { assertNoDependencyCycles } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from '../load-graph';

describe('assertNoDependencyCycles', () => {
  let graph: Awaited<ReturnType<typeof loadArchitectureGraph>>;
  beforeAll(async () => {
    graph = await loadArchitectureGraph();
  }, 180_000);
  it('forbids depends-on cycles', () => {
    assertNoDependencyCycles(graph.graph);
  });
});
