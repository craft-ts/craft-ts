import { beforeAll, describe, it } from 'vitest';
import { assertResourceParamsPreferQueryParams } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from '../load-graph';

describe('assertResourceParamsPreferQueryParams', () => {
  let graph: Awaited<ReturnType<typeof loadArchitectureGraph>>;
  beforeAll(async () => {
    graph = await loadArchitectureGraph();
  }, 180_000);
  it('keeps resource params URL-backed', () => {
    assertResourceParamsPreferQueryParams(graph.graph);
  });
});
