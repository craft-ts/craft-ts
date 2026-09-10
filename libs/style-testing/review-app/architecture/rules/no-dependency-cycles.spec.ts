import { beforeAll, describe, it } from 'vitest';
import { assertNoDependencyCycles } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from '../load-graph';

describe('assertNoDependencyCycles', () => {
  let graph: ReturnType<typeof loadArchitectureGraph>;
  beforeAll(() => {
    graph = loadArchitectureGraph();
  }, 180_000);
  it('forbids depends-on cycles', () => {
    assertNoDependencyCycles(graph.graph);
  });
});
