import { describe, expect, it } from 'vitest';
import { assertPersistedPrimitiveHasUnique } from '@craft-ng/dev-tools';
import { loadArchitectureFixture } from '../load-graph';

describe('assertPersistedPrimitiveHasUnique', () => {
  it('accepts persisted primitives wrapped in craftUnique', () => {
    const graph = loadArchitectureFixture('app');
    expect(() => assertPersistedPrimitiveHasUnique(graph.graph)).not.toThrow();
  });

  it('rejects a persisted primitive whose identity is not craftUnique', () => {
    const graph = loadArchitectureFixture('persisted-without-unique');
    expect(() => assertPersistedPrimitiveHasUnique(graph.graph)).toThrow(
      /Persisted query leaked is missing craftUnique/,
    );
  });
});
