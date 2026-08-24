import { describe, expect, it } from 'vitest';
import {
  assertQueryMutationHasServerState,
  createArchitectureGraph,
} from '@craft-ts/dev-tools';

type ArchitectureGraph = ReturnType<typeof createArchitectureGraph>;

// #region example
export function keepServerResourcesConnected(graph: ArchitectureGraph) {
  assertQueryMutationHasServerState(graph.graph);
}
// #endregion example

describe('guide/testing/architecture/server-state-loader.md #example', () => {
  it('keeps the documented assertion type-safe', () => {
    expect(keepServerResourcesConnected).toEqual(expect.any(Function));
  });
});
