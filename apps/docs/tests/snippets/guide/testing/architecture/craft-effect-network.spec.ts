import { describe, expect, it } from 'vitest';
import {
  assertCraftEffectNoNetwork,
  createArchitectureGraph,
} from '@craft-ts/dev-tools';

type ArchitectureGraph = ReturnType<typeof createArchitectureGraph>;

// #region example
export function keepNetworkWorkInResources(graph: ArchitectureGraph) {
  assertCraftEffectNoNetwork(graph.graph);
}
// #endregion example

describe('guide/testing/architecture/craft-effect-network.md #example', () => {
  it('keeps the documented assertion type-safe', () => {
    expect(keepNetworkWorkInResources).toEqual(expect.any(Function));
  });
});
