import { beforeAll, describe, it } from 'vitest';
import { assertInteractiveElementNamed } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from '../load-graph';

describe('assertInteractiveElementNamed', () => {
  let graph: ReturnType<typeof loadArchitectureGraph>;
  beforeAll(() => {
    graph = loadArchitectureGraph();
  }, 180_000);
  it('requires a unique literal data-craft-name on every interactive element', () => {
    assertInteractiveElementNamed(graph.graph);
  });
});
