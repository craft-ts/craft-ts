import { describe, expect, it } from 'vitest';
import {
  assertPathBoundaries,
  createArchitectureGraph,
} from '@craft-ts/dev-tools';

type ArchitectureGraph = ReturnType<typeof createArchitectureGraph>;

// #region example
export function keepFeaturePathsInTheirLanes(graph: ArchitectureGraph) {
  assertPathBoundaries(graph.graph, {
    constraints: [
      {
        source: 'src/app/features/:feature/**',
        onlyDependOn: [
          'src/app/features/:feature/**',
          'src/app/shared/**',
          'src/app/ui/**',
        ],
      },
    ],
  });
}
// #endregion example

describe('guide/testing/architecture/path-boundaries.md #example', () => {
  it('keeps the documented assertion type-safe', () => {
    expect(keepFeaturePathsInTheirLanes).toEqual(expect.any(Function));
  });
});
