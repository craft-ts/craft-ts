import { beforeAll, describe, expect, it } from 'vitest';
import { loadArchitectureFixture } from './load-graph';

describe('architecture application fixture', () => {
  let graph: ReturnType<typeof loadArchitectureFixture>;

  beforeAll(() => {
    graph = loadArchitectureFixture('app');
  }, 60_000);

  it('indexes the application routes, components and provided services', () => {
    expect(graph.route('/admin').kind).toBe('route');
    expect(graph.route('/checkout').kind).toBe('route');
    expect(graph.route('/users/:id').kind).toBe('route');
    expect(graph.component('AdminPage').kind).toBe('component');
    expect(graph.component('CheckoutPage').kind).toBe('component');
    expect(graph.route('/admin').provider('UserList').label).toBe('UserList');
    expect(graph.providedOn('UserList').map((node) => node.label)).toEqual(
      expect.arrayContaining([expect.stringContaining('/admin')]),
    );
    expect(graph.providedOn('Cart').map((node) => node.label)).toEqual(
      expect.arrayContaining([expect.stringContaining('/checkout')]),
    );
    expect(graph.providedOn('UserDetail').map((node) => node.label)).toEqual(
      expect.arrayContaining([expect.stringContaining('/users/:id')]),
    );
  });

  it('indexes HTTP endpoints and browser-boundary services', () => {
    expect(graph.httpEndpoint('GET', 'users').label).toBe('GET users');
    expect(graph.usingHttp().map((node) => node.label)).toContain('UsersApi');
    expect(
      graph.services({ browserBoundary: true }).map((node) => node.label),
    ).toEqual(['UsersApi']);
    expect(
      graph.dependingOnBrowserBoundary().map((node) => node.label),
    ).toEqual(expect.arrayContaining(['UserList', 'UserDetail']));
  });
});
