import { describe, expect, it } from 'vitest';
import { assertCraftEffectNoNetwork } from '@craft-ng/dev-tools';
import { loadArchitectureFixture } from '../load-graph';

describe('assertCraftEffectNoNetwork', () => {
  it('accepts an app whose craftEffect nodes stay off the network', () => {
    const graph = loadArchitectureFixture('app');
    expect(() => assertCraftEffectNoNetwork(graph.graph)).not.toThrow();
  });

  it('rejects a craftEffect that calls HTTP', () => {
    const graph = loadArchitectureFixture('effect-calls-http');
    expect(() => assertCraftEffectNoNetwork(graph.graph)).toThrow(
      /craftEffect poll calls HTTP/,
    );
  });

  it('rejects a craftEffect that calls a mutation', () => {
    const graph = loadArchitectureFixture('effect-calls-mutation');
    expect(() => assertCraftEffectNoNetwork(graph.graph)).toThrow(
      /craftEffect poll calls mutation/,
    );
  });
});
