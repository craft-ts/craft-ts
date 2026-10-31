import { describe, expect, it } from 'vitest';
import {
  assertQueryParamsRouteOwnership,
  createArchitectureGraph,
} from '@craft-ts/dev-tools';

type ArchitectureGraph = ReturnType<typeof createArchitectureGraph>;

// #region example
export function keepQueryParamsRouteOwned(graph: ArchitectureGraph) {
  assertQueryParamsRouteOwnership(graph.graph);
}
// #endregion example

describe('guide/testing/architecture/query-params-route-ownership.md #example', () => {
  it('keeps the documented assertion type-safe', () => {
    expect(keepQueryParamsRouteOwned).toEqual(expect.any(Function));
  });
});
