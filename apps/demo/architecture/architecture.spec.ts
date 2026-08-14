import { beforeAll, describe, expect, it } from 'vitest';
import { loadDemoArchitectureGraph } from './load-graph';

/**
 * Demo-specific lookups. Common architecture rules live in `rules/`.
 * Run with `npx nx architecture demo`.
 */
describe('demo architecture', () => {
  let graph: ReturnType<typeof loadDemoArchitectureGraph>;

  beforeAll(() => {
    graph = loadDemoArchitectureGraph();
  }, 180_000);

  it('indexes demo routes and provided feature services', () => {
    expect(graph.route('craft/query/:userId').kind).toBe('route');
    expect(graph.route('craft/mutation/:userId').kind).toBe('route');
    expect(graph.providedOn('UserList').map((node) => node.label)).toEqual(
      expect.arrayContaining([expect.stringMatching(/ListWithPagination/)]),
    );
    expect(graph.providedOn('UserMutation').map((node) => node.label)).toEqual(
      expect.arrayContaining([expect.stringMatching(/Mutation/)]),
    );
  });

  it('indexes the users HTTP endpoint', () => {
    expect(graph.httpEndpoint('GET', 'users').label).toBe('GET users');
    expect(graph.usingHttp().map((node) => node.label)).toEqual(
      expect.arrayContaining(['UsersApiOnError']),
    );
  });

  it('looks up a persisted unique identity', () => {
    expect(
      graph.unique('{"key":"user-query","storeName":"demo-app"}').kind,
    ).toBe('unique');
  });
});
