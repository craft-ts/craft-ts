import { describe, expect, it } from 'vitest';
import {
  assertPersistedPrimitiveHasUnique,
  createArchitectureGraph,
} from '@craft-ts/dev-tools';

type ArchitectureGraph = ReturnType<typeof createArchitectureGraph>;

// #region example
export function keepPersistedPrimitivesIdentifiable(graph: ArchitectureGraph) {
  assertPersistedPrimitiveHasUnique(graph.graph);
}
// #endregion example

describe('guide/testing/architecture/persisted-identities.md #example', () => {
  it('keeps the documented assertion type-safe', () => {
    expect(keepPersistedPrimitivesIdentifiable).toEqual(expect.any(Function));
  });
});
