import { describe, expect, it } from 'vitest';
import {
  assertHttpEndpointUnique,
  createArchitectureGraph,
} from '@craft-ts/dev-tools';

type ArchitectureGraph = ReturnType<typeof createArchitectureGraph>;

// #region example
export function keepEndpointOwnershipUnique(graph: ArchitectureGraph) {
  assertHttpEndpointUnique(graph.graph);
}
// #endregion example

describe('guide/testing/architecture/http-endpoint-ownership.md #example', () => {
  it('keeps the documented assertion type-safe', () => {
    expect(keepEndpointOwnershipUnique).toEqual(expect.any(Function));
  });
});
