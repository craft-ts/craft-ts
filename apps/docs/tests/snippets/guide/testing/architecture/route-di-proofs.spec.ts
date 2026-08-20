import { describe, expect, it } from 'vitest';
import {
  assertRouteDiProofs,
  createArchitectureGraph,
} from '@craft-ts/dev-tools';

type ArchitectureGraph = ReturnType<typeof createArchitectureGraph>;

// #region example
export function keepEveryRouteDiProofArmed(graph: ArchitectureGraph) {
  assertRouteDiProofs(graph.graph);
}
// #endregion example

describe('guide/testing/architecture/route-di-proofs.md #example', () => {
  it('keeps the documented assertion type-safe', () => {
    expect(keepEveryRouteDiProofArmed).toEqual(expect.any(Function));
  });
});
