import { beforeAll, describe, it } from 'vitest';
import { assertInteractiveElementNamed } from '@craft-ng/dev-tools';
import { loadDemoArchitectureGraph } from '../load-graph';

describe('assertInteractiveElementNamed', () => {
  let graph: ReturnType<typeof loadDemoArchitectureGraph>;

  beforeAll(() => {
    graph = loadDemoArchitectureGraph();
  }, 180_000);

  it('requires a unique literal data-craft-name on every interactive element', () => {
    assertInteractiveElementNamed(graph.graph);
  });
});
