import { describe, expect, it } from 'vitest';
import {
  createArchitectureGraph,
  noExclusiveLink,
} from '@craft-ts/dev-tools';

type ArchitectureGraph = ReturnType<typeof createArchitectureGraph>;

// #region example
export function keepFeatureBranchesIndependent(graph: ArchitectureGraph) {
  noExclusiveLink(graph.route('/admin'), graph.route('/checkout'));
}
// #endregion example

describe('guide/testing/architecture/exclusive-links.md #example', () => {
  it('keeps the documented assertion type-safe', () => {
    expect(keepFeatureBranchesIndependent).toEqual(expect.any(Function));
  });
});
