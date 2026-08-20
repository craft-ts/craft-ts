import { describe, expect, it } from 'vitest';
import {
  assertCraftUnique,
  createArchitectureGraph,
} from '@craft-ts/dev-tools';

type ArchitectureGraph = ReturnType<typeof createArchitectureGraph>;

// #region example
export function keepStorageIdentitiesUnique(graph: ArchitectureGraph) {
  assertCraftUnique(graph.graph);
}
// #endregion example

describe('guide/testing/architecture/unique-identities.md #example', () => {
  it('keeps the documented assertion type-safe', () => {
    expect(keepStorageIdentitiesUnique).toEqual(expect.any(Function));
  });
});
