import { describe, expect, it } from 'vitest';
import { assertInsertSelectUnique } from '@craft-ng/dev-tools';
import { loadArchitectureFixture } from '../load-graph';

describe('assertInsertSelectUnique', () => {
  it('accepts an app whose insertSelect keys do not collide on a host', () => {
    const graph = loadArchitectureFixture('app');
    expect(() => assertInsertSelectUnique(graph.graph)).not.toThrow();
  });

  it('rejects two insertSelect keys on the same host', () => {
    const graph = loadArchitectureFixture('duplicate-insert-select');
    expect(() => assertInsertSelectUnique(graph.graph)).toThrow(
      /Duplicate insertSelect cell/,
    );
  });
});
