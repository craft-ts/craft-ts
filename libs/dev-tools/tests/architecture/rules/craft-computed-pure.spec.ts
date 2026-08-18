import { describe, expect, it } from 'vitest';
import { assertCraftComputedPure } from '@craft-ts/dev-tools';
import { loadArchitectureFixture } from '../load-graph';

describe('assertCraftComputedPure', () => {
  it('accepts a valid app whose craftComputed nodes only read', () => {
    const graph = loadArchitectureFixture('app');
    expect(() => assertCraftComputedPure(graph.graph)).not.toThrow();
  });

  it('rejects a craftComputed that calls a craftMethod', () => {
    const graph = loadArchitectureFixture('computed-calls-method');
    expect(() => assertCraftComputedPure(graph.graph)).toThrow(
      /craftComputed label calls/,
    );
  });

  it('rejects a craftComputed that emits a source$', () => {
    const graph = loadArchitectureFixture('computed-writes-source');
    expect(() => assertCraftComputedPure(graph.graph)).toThrow(
      /craftComputed label writes/,
    );
  });
});
