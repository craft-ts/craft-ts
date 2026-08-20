import { describe, expect, it } from 'vitest';
import {
  assertMutationHasReactOn,
  createArchitectureGraph,
} from '@craft-ts/dev-tools';

type ArchitectureGraph = ReturnType<typeof createArchitectureGraph>;

// #region example
export function keepReadsFreshAfterWrites(graph: ArchitectureGraph) {
  assertMutationHasReactOn(graph.graph, {
    allow: ['logout'],
  });
}
// #endregion example

describe('guide/testing/architecture/mutation-reactions.md #example', () => {
  it('keeps the documented assertion type-safe', () => {
    expect(keepReadsFreshAfterWrites).toEqual(expect.any(Function));
  });
});
