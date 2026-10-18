import { beforeAll, describe, expect, it } from 'vitest';
import { assertDeclarativeArchitecture } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from './load-graph';
import { architectureWaiverList } from './waivers';

/**
 * The graph is loaded once for the whole suite: every rule, the design-system
 * ones included, runs through `assertDeclarativeArchitecture`.
 */
describe('architecture', () => {
  let graph: Awaited<ReturnType<typeof loadArchitectureGraph>>;

  beforeAll(async () => {
    graph = await loadArchitectureGraph();
  }, 180_000);

  it('loads the architecture graph', () => {
    expect(graph.graph.version).toBe(1);
  });

  it('keeps the base rules, the style rules included', () => {
    assertDeclarativeArchitecture(graph.graph, {
      waivers: architectureWaiverList,
      // The AI chat's own mutation is the framework's, not this app's: nothing
      // in a replay dashboard has a query to refresh after it.
      allow: ['sendContextToAi'],
    });
  });
});
