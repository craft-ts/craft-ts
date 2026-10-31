import { describe, expect, it } from 'vitest';
import {
  assertRuntimeEntityNamesUnique,
  createArchitectureGraph,
} from '@craft-ts/dev-tools';

type ArchitectureGraph = ReturnType<typeof createArchitectureGraph>;

// #region example
export function keepRuntimeEntityNamesUnique(graph: ArchitectureGraph) {
  assertRuntimeEntityNamesUnique(graph.graph);
}
// #endregion example

describe('guide/testing/architecture/runtime-entity-names.md #example', () => {
  it('keeps the documented assertion type-safe', () => {
    expect(keepRuntimeEntityNamesUnique).toEqual(expect.any(Function));
  });
});
