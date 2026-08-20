import { describe, expect, it } from 'vitest';
import {
  assertPrimitiveLoaderRequirements,
  createArchitectureGraph,
} from '@craft-ts/dev-tools';

type ArchitectureGraph = ReturnType<typeof createArchitectureGraph>;

// #region example
export function keepEffectLoadersOnAnEffectBoundary(
  graph: ArchitectureGraph,
) {
  assertPrimitiveLoaderRequirements(graph.graph, {
    primitives: ['queryEffect', 'mutationEffect'],
    requirements: [
      {
        label: 'an Effect service',
        matches: ({ target }) =>
          target.kind === 'service' && target.details?.['runtime'] === 'effect',
      },
    ],
  });
}
// #endregion example

describe('guide/testing/architecture/primitive-loader-requirements.md #example', () => {
  it('keeps the documented assertion type-safe', () => {
    expect(keepEffectLoadersOnAnEffectBoundary).toEqual(expect.any(Function));
  });
});
