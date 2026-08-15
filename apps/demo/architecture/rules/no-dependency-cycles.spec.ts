import { beforeAll, describe, it } from 'vitest';
import { assertNoDependencyCycles } from '@craft-ng/dev-tools';
import { loadDemoArchitectureGraph } from '../load-graph';

describe('assertNoDependencyCycles', () => {
  let graph: ReturnType<typeof loadDemoArchitectureGraph>;

  beforeAll(() => {
    graph = loadDemoArchitectureGraph();
  }, 180_000);

  it('forbids depends-on cycles', () => {
    assertNoDependencyCycles(graph.graph);
  });
});
