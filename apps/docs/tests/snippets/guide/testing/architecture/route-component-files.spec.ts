import { describe, expect, it } from 'vitest';
import {
  assertRouteComponentsInSeparateFiles,
  createArchitectureGraph,
} from '@craft-ts/dev-tools';

type ArchitectureGraph = ReturnType<typeof createArchitectureGraph>;

// #region example
export function keepRouteComponentsInSeparateFiles(
  graph: ArchitectureGraph,
) {
  assertRouteComponentsInSeparateFiles(graph.graph);
}
// #endregion example

describe('guide/testing/architecture/route-component-files.md #example', () => {
  it('keeps the documented assertion type-safe', () => {
    expect(keepRouteComponentsInSeparateFiles).toEqual(expect.any(Function));
  });
});
