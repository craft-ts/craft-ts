import { describe, expect, it } from 'vitest';
import {
  assertCraftEffectNoImperativeSync,
  createArchitectureGraph,
} from '@craft-ts/dev-tools';

type ArchitectureGraph = ReturnType<typeof createArchitectureGraph>;

// #region example
export function keepResourceTransitionsDeclarative(graph: ArchitectureGraph) {
  assertCraftEffectNoImperativeSync(graph.graph);
}
// #endregion example

describe('guide/testing/architecture/craft-effect-imperative-sync.md #example', () => {
  it('keeps the documented assertion type-safe', () => {
    expect(keepResourceTransitionsDeclarative).toEqual(expect.any(Function));
  });
});
