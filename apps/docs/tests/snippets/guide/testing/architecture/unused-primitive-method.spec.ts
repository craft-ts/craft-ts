import { describe, expect, it } from 'vitest';
import {
  assertNoUnusedPrimitiveMethods,
  createArchitectureGraph,
} from '@craft-ts/dev-tools';

type ArchitectureGraph = ReturnType<typeof createArchitectureGraph>;

// #region example
export function removeUnusedPrimitiveMethods(graph: ArchitectureGraph) {
  assertNoUnusedPrimitiveMethods(graph.graph);
}
// #endregion example

describe('guide/testing/architecture/unused-primitive-method.md #example', () => {
  it('keeps the documented assertion type-safe', () => {
    expect(removeUnusedPrimitiveMethods).toEqual(expect.any(Function));
  });
});
