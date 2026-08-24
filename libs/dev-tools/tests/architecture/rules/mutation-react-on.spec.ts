import { describe, expect, it } from 'vitest';
import { assertMutationHasReactOn } from '@craft-ts/dev-tools';
import { loadArchitectureFixture } from '../load-graph';

describe('assertMutationHasReactOn', () => {
  it('accepts an app with no orphan mutations', () => {
    const graph = loadArchitectureFixture('app');
    expect(() => assertMutationHasReactOn(graph.graph)).not.toThrow();
  });

  it('rejects a mutation that no query reacts to', () => {
    const graph = loadArchitectureFixture('orphan-mutation');
    expect(() => assertMutationHasReactOn(graph.graph)).toThrow(
      /Mutation save has no query reacting to it/,
    );
  });
});
