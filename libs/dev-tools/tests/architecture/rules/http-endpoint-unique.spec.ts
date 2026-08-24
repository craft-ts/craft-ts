import { describe, expect, it } from 'vitest';
import { assertHttpEndpointUnique } from '@craft-ts/dev-tools';
import { loadArchitectureFixture } from '../load-graph';

describe('assertHttpEndpointUnique', () => {
  it('accepts a valid app that owns each HTTP verb+url once', () => {
    const graph = loadArchitectureFixture('app');
    expect(() => assertHttpEndpointUnique(graph.graph)).not.toThrow();
  });

  it('rejects the same HTTP verb+url called twice', () => {
    const graph = loadArchitectureFixture('duplicate-http');
    expect(() => assertHttpEndpointUnique(graph.graph)).toThrow(
      /Duplicate HTTP GET users used twice/,
    );
  });
});
