import { beforeAll, describe, expect, it } from 'vitest';
import { assertDeclarativeArchitecture } from '@craft-ts/dev-tools';
import { loadArchitectureGraph } from './load-graph';
import { architectureWaiverList } from './waivers';

/** App-specific lookups. Common architecture rules live in `rules/`. */
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
      // The AI overlay's mutation, shared by every app: nothing to refresh.
      allow: ['sendContextToAi'],
      waivers: architectureWaiverList,
    });
  });
});
