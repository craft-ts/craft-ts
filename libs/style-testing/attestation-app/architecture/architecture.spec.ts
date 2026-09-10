import { beforeAll, describe, expect, it } from 'vitest';
import { loadArchitectureGraph } from './load-graph';

/** App-specific lookups. Common architecture rules live in `rules/`. */
describe('architecture', () => {
  let graph: ReturnType<typeof loadArchitectureGraph>;

  beforeAll(() => {
    graph = loadArchitectureGraph();
  }, 180_000);

  it('loads the architecture graph', () => {
    expect(graph.graph.version).toBe(1);
  });
});
