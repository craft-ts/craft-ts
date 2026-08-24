import { describe, expect, it } from 'vitest';
import {
  assertInteractiveElementNamed,
  createArchitectureGraph,
} from '@craft-ts/dev-tools';

type ArchitectureGraph = ReturnType<typeof createArchitectureGraph>;

// #region example
export function keepInteractiveControlsAddressable(graph: ArchitectureGraph) {
  assertInteractiveElementNamed(graph.graph);
}
// #endregion example

describe('guide/testing/architecture/interactive-element-names.md #example', () => {
  it('keeps the documented assertion type-safe', () => {
    expect(keepInteractiveControlsAddressable).toEqual(expect.any(Function));
  });
});
