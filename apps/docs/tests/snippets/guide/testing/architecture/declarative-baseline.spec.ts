import { describe, expect, it } from 'vitest';
import {
  assertDeclarativeArchitecture,
  createArchitectureGraph,
} from '@craft-ts/dev-tools';

type ArchitectureGraph = ReturnType<typeof createArchitectureGraph>;

// #region example
export function keepTheAppDeclarative(graph: ArchitectureGraph) {
  assertDeclarativeArchitecture(graph.graph);
}
// #endregion example

describe('guide/testing/architecture/declarative-baseline.md #example', () => {
  it('keeps the documented assertion type-safe', () => {
    expect(keepTheAppDeclarative).toEqual(expect.any(Function));
  });
});
