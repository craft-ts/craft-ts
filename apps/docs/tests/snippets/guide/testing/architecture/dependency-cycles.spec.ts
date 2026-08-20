import { describe, expect, it } from 'vitest';
import {
  assertNoDependencyCycles,
  createArchitectureGraph,
} from '@craft-ts/dev-tools';

type ArchitectureGraph = ReturnType<typeof createArchitectureGraph>;

// #region example
export function keepTheDependencyGraphAcyclic(graph: ArchitectureGraph) {
  assertNoDependencyCycles(graph.graph);
}
// #endregion example

describe('guide/testing/architecture/dependency-cycles.md #example', () => {
  it('keeps the documented assertion type-safe', () => {
    expect(keepTheDependencyGraphAcyclic).toEqual(expect.any(Function));
  });
});
