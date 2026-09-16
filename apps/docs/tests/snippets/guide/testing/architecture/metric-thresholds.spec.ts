import { describe, expect, it } from 'vitest';
import {
  assertMetricThresholds,
  createArchitectureGraph,
} from '@craft-ts/dev-tools';

type ArchitectureGraph = ReturnType<typeof createArchitectureGraph>;

// #region example
export function keepOwnedNodesWithinAgreedLimits(graph: ArchitectureGraph) {
  assertMetricThresholds(graph.graph, {
    kinds: ['service', 'component', 'primitive'],
    max: {
      cyclomaticOwn: 12,
      cyclomaticTotal: 30,
      lines: 160,
      fanOut: 12,
    },
    allow: ['src/legacy/**'],
  });
}
// #endregion example

describe('guide/testing/architecture/metric-thresholds.md #example', () => {
  it('keeps the documented assertion type-safe', () => {
    expect(keepOwnedNodesWithinAgreedLimits).toEqual(expect.any(Function));
  });
});
