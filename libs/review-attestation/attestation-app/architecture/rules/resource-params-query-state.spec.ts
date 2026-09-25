import { beforeAll, describe, it } from 'vitest';
import { assertResourceParamsPreferQueryParams } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from '../load-graph';

describe('assertResourceParamsPreferQueryParams', () => {
  let graph: Awaited<ReturnType<typeof loadArchitectureGraph>>;
  beforeAll(async () => {
    graph = await loadArchitectureGraph();
  }, 180_000);
  it('allows only the intentional local filters in resource params', () => {
    assertResourceParamsPreferQueryParams(graph.graph, {
      // Inventory filters are intentionally local UI state: changing them
      // changes the currently selected card and its source-detail request.
      allow: [
        'componentFilter',
        'textFilter',
        'kindFilter',
        'stateFilter',
        'directionFilter',
      ].map((name) => ({
        name,
        file: 'libs/review-attestation/attestation-app/src/review-filters.service.ts',
      })),
    });
  });
});
