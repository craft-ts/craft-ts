import { describe, expect, it } from 'vitest';
import {
  assertCraftComputedPure,
  createArchitectureGraph,
} from '@craft-ts/dev-tools';

type ArchitectureGraph = ReturnType<typeof createArchitectureGraph>;

// #region example
export function keepDerivationsPure(graph: ArchitectureGraph) {
  assertCraftComputedPure(graph.graph);
}
// #endregion example

describe('guide/testing/architecture/computed-purity.md #example', () => {
  it('keeps the documented assertion type-safe', () => {
    expect(keepDerivationsPure).toEqual(expect.any(Function));
  });
});
