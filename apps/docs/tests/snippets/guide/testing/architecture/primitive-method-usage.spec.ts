import { describe, expect, it } from 'vitest';
import {
  assertPrimitiveMethodsUsedOnce,
  createArchitectureGraph,
} from '@craft-ts/dev-tools';

type ArchitectureGraph = ReturnType<typeof createArchitectureGraph>;

// #region example
export function keepPrimitiveMethodsLocal(graph: ArchitectureGraph) {
  assertPrimitiveMethodsUsedOnce(graph.graph);
}
// #endregion example

describe('guide/testing/architecture/primitive-method-usage.md #example', () => {
  it('keeps the documented assertion type-safe', () => {
    expect(keepPrimitiveMethodsLocal).toEqual(expect.any(Function));
  });
});
