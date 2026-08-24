import { describe, expect, it } from 'vitest';
import {
  assertInsertSelectUnique,
  createArchitectureGraph,
} from '@craft-ts/dev-tools';

type ArchitectureGraph = ReturnType<typeof createArchitectureGraph>;

// #region example
export function keepSelectedInsertionKeysUnambiguous(
  graph: ArchitectureGraph,
) {
  assertInsertSelectUnique(graph.graph);
}
// #endregion example

describe('guide/testing/architecture/insert-select-keys.md #example', () => {
  it('keeps the documented assertion type-safe', () => {
    expect(keepSelectedInsertionKeysUnambiguous).toEqual(
      expect.any(Function),
    );
  });
});
