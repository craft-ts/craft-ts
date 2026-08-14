import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeDependencyGraph } from './dependency-graph';
import {
  createArchitectureGraph,
  noExclusiveLink,
} from './architecture-graph';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'craft-architecture-graph-'));
  temporaryDirectories.push(root);
  await writeFile(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        strict: true,
        skipLibCheck: true,
      },
      include: ['./**/*.ts'],
    }),
    'utf8',
  );
  await Promise.all(
    Object.entries(files).map(([path, contents]) =>
      writeFile(join(root, path), contents, 'utf8'),
    ),
  );
  return root;
}

const STUBS = `
declare function craftService(...args: unknown[]): Record<string, (...args: never[]) => unknown>;
declare function craftComponent(...args: unknown[]): unknown;
declare function craftRoutes(...args: unknown[]): unknown;
declare function craftRoute(...args: unknown[]): unknown;
declare function state(...args: unknown[]): unknown;
declare function div(...args: unknown[]): unknown;
declare const CraftHttpClient: {
  get(config: (helpers: { response: () => unknown }) => { url: string }): unknown;
};
`;

describe('createArchitectureGraph', () => {
  it('looks up routes, provided services, HTTP endpoints and browser boundaries', async () => {
    const root = await fixture({
      'app.ts': `
        ${STUBS}

        const { UsersApi } = craftService(
          { name: 'UsersApi', scope: 'global', browserBoundary: true },
          function* () {
            const users = yield* CraftHttpClient.get(({ response }) => ({
              url: 'users',
              success: response(),
            }));
            return { users };
          },
        );

        const { User, provideUser } = craftService(
          { name: 'User', scope: 'toProvide' },
          function* () {
            const { users } = yield* UsersApi();
            return { users };
          },
        );

        const { Cart, provideCart } = craftService(
          { name: 'Cart', scope: 'toProvide' },
          () => ({}),
        );

        const Admin = craftComponent(
          'Admin',
          {},
          function* () {
            yield* User();
            return {};
          },
          () => div([]),
        );

        export const appRoutes = craftRoutes('appRoutes', [
          craftRoute('/admin', {
            path: '/admin',
            providers: [provideUser()],
            loadComponent: () => Promise.resolve(Admin),
          }),
          craftRoute('/checkout', {
            path: '/checkout',
            providers: [provideCart()],
          }),
        ]);
      `,
    });

    const graph = createArchitectureGraph(
      analyzeDependencyGraph({
        rootDir: root,
        tsConfigFilePath: 'tsconfig.json',
      }),
    );

    expect(graph.route('/admin').label).toContain('/admin');
    expect(graph.route('/admin').provider('User').label).toBe('User');
    expect(graph.providedOn('User').map((node) => node.label)).toEqual(
      expect.arrayContaining([expect.stringContaining('/admin')]),
    );
    expect(graph.httpEndpoint('GET', 'users').label).toBe('GET users');
    expect(graph.usingHttp().map((node) => node.label)).toContain('UsersApi');
    expect(
      graph.services({ browserBoundary: true }).map((node) => node.label),
    ).toEqual(['UsersApi']);
    expect(graph.dependingOnBrowserBoundary().map((node) => node.label)).toContain(
      'User',
    );
  });

  it('allows a shared kernel between exclusive feature branches', async () => {
    const root = await fixture({
      'app.ts': `
        ${STUBS}

        const { Auth } = craftService(
          { name: 'Auth', scope: 'global' },
          () => ({}),
        );

        const { User, provideUser } = craftService(
          { name: 'User', scope: 'toProvide' },
          function* () {
            yield* Auth();
            return {};
          },
        );

        const { Cart, provideCart } = craftService(
          { name: 'Cart', scope: 'toProvide' },
          function* () {
            yield* Auth();
            return {};
          },
        );

        export const appRoutes = craftRoutes('appRoutes', [
          craftRoute('/admin', { path: '/admin', providers: [provideUser()] }),
          craftRoute('/checkout', { path: '/checkout', providers: [provideCart()] }),
        ]);
      `,
    });

    const graph = createArchitectureGraph(
      analyzeDependencyGraph({
        rootDir: root,
        tsConfigFilePath: 'tsconfig.json',
      }),
    );

    expect(() =>
      noExclusiveLink(graph.route('/admin'), graph.route('/checkout')),
    ).not.toThrow();
  });

  it('rejects an exclusive link from one provided branch into another', async () => {
    const root = await fixture({
      'app.ts': `
        ${STUBS}

        const { User, provideUser } = craftService(
          { name: 'User', scope: 'toProvide' },
          () => ({}),
        );

        const { Cart, provideCart } = craftService(
          { name: 'Cart', scope: 'toProvide' },
          function* () {
            yield* User();
            return {};
          },
        );

        export const appRoutes = craftRoutes('appRoutes', [
          craftRoute('/admin', { path: '/admin', providers: [provideUser()] }),
          craftRoute('/checkout', { path: '/checkout', providers: [provideCart()] }),
        ]);
      `,
    });

    const graph = createArchitectureGraph(
      analyzeDependencyGraph({
        rootDir: root,
        tsConfigFilePath: 'tsconfig.json',
      }),
    );

    expect(() =>
      noExclusiveLink(graph.route('/admin'), graph.route('/checkout')),
    ).toThrow(/Exclusive architecture link/);
  });

  it('throws when a named node does not exist', async () => {
    const root = await fixture({
      'app.ts': `
        ${STUBS}
        const { User } = craftService({ name: 'User', scope: 'global' }, () => ({}));
      `,
    });

    const graph = createArchitectureGraph(
      analyzeDependencyGraph({
        rootDir: root,
        tsConfigFilePath: 'tsconfig.json',
      }),
    );

    expect(() => graph.service('Missing')).toThrow(/Unknown service 'Missing'/);
  });
});
