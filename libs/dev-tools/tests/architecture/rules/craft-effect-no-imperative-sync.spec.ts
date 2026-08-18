import { describe, expect, it } from 'vitest';
import { assertCraftEffectNoImperativeSync } from '@craft-ts/dev-tools';
import { loadArchitectureFixture } from '../load-graph';

describe('assertCraftEffectNoImperativeSync', () => {
  it('accepts an app whose craftEffect nodes do not push into other primitives', () => {
    const graph = loadArchitectureFixture('app');
    expect(() => assertCraftEffectNoImperativeSync(graph.graph)).not.toThrow();
  });

  it('rejects a craftEffect that writes a state', () => {
    const graph = loadArchitectureFixture('effect-writes-state');
    expect(() => assertCraftEffectNoImperativeSync(graph.graph)).toThrow(
      /craftEffect sync writes state result/,
    );
  });

  it('rejects a craftEffect that calls a query', () => {
    const graph = loadArchitectureFixture('effect-calls-query');
    expect(() => assertCraftEffectNoImperativeSync(graph.graph)).toThrow(
      /craftEffect sync calls query usersQuery/,
    );
  });
});
