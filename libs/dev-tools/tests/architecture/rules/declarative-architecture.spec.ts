import { describe, expect, it } from 'vitest';
import { assertDeclarativeArchitecture } from '@craft-ng/dev-tools';
import { loadArchitectureFixture } from '../load-graph';

describe('assertDeclarativeArchitecture', () => {
  it('accepts a valid app', () => {
    const graph = loadArchitectureFixture('app');
    expect(() => assertDeclarativeArchitecture(graph.graph)).not.toThrow();
  });

  it('rejects the same HTTP verb+url called twice', () => {
    const graph = loadArchitectureFixture('duplicate-http');
    expect(() => assertDeclarativeArchitecture(graph.graph)).toThrow(
      /GET users/,
    );
  });

  it('rejects a mutation that no query reacts to', () => {
    const graph = loadArchitectureFixture('orphan-mutation');
    expect(() => assertDeclarativeArchitecture(graph.graph)).toThrow(
      /Mutation save has no query reacting to it/,
    );
  });
});
