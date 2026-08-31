import { describe, expect, it } from 'vitest';
import {
  assertResourceParamsPreferQueryParams,
  createArchitectureGraph,
} from '@craft-ts/dev-tools';

type ArchitectureGraph = ReturnType<typeof createArchitectureGraph>;

// #region example
export function keepResourceParamsShareable(graph: ArchitectureGraph) {
  assertResourceParamsPreferQueryParams(graph.graph, {
    allow: [
      {
        name: 'locale',
        file: 'src/app/examples/effect/effect-i18n.ts',
      },
    ],
  });
}
// #endregion example

describe('guide/testing/architecture/resource-params-query-state.md #example', () => {
  it('keeps the documented assertion type-safe', () => {
    expect(keepResourceParamsShareable).toEqual(expect.any(Function));
  });
});
