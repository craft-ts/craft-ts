import { beforeEach, describe, expect, it } from 'vitest';
import {
  craftException,
  isCraftException,
  provideServerFunctionTransport,
  TestBed,
} from '@craft-ts/core';
import {
  assertServerFunctionArchitecture,
  createArchitectureGraph,
} from '@craft-ts/dev-tools/architecture-graph';
import { analyzeDependencyGraph } from '@craft-ts/dev-tools/dependency-graph';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { getAuthenticatedUsers } from './users/authenticated-list.fn-client';
import { getUsers } from './users/list.fn-client';
import { demoAuthenticatedUser } from './server/authentication';
import { listenDemoServer } from './server/server';

const demoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('demo with server function', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('calls the Effect backend through the client facade and local DB', async () => {
    const server = await listenDemoServer();
    try {
      configureServerFunctionTransport(server.url);

      const users = await TestBed.runInInjectionContext(() =>
        getUsers({ filter: 'ada' }),
      );

      expect(users).toEqual([
        { id: 1, name: 'Ada Lovelace', email: 'ada@craft.dev' },
      ]);
      console.log(
        `server function demo: client -> ${server.url} -> Effect -> local DB`,
        users,
      );
    } finally {
      await server.close();
    }
  });

  it('rejects a browser identity that does not match the authenticated server user', async () => {
    const server = await listenDemoServer();
    try {
      configureServerFunctionTransport(server.url);

      const result = await TestBed.runInInjectionContext(() =>
        getAuthenticatedUsers({ filter: 'ada', userId: 'other-user' }),
      );

      expect(isCraftException(result)).toBe(true);
      expect(JSON.stringify(result)).toContain('AuthenticatedUserMismatch');
    } finally {
      await server.close();
    }
  });

  it('rejects a forged admin claim when the server session is not admin', async () => {
    const server = await listenDemoServer({
      ...demoAuthenticatedUser,
      role: 'member',
    });
    try {
      configureServerFunctionTransport(server.url);

      const result = await TestBed.runInInjectionContext(() =>
        getAuthenticatedUsers({ filter: 'ada', userId: 'user-ada' }),
      );

      expect(isCraftException(result)).toBe(true);
      expect(JSON.stringify(result)).toContain('admin role required');
    } finally {
      await server.close();
    }
  });

  it('is visible as a valid two-file server-function family', () => {
    const graph = createArchitectureGraph(
      analyzeDependencyGraph({
        rootDir: demoRoot,
        tsConfigFilePath: 'tsconfig.json',
      }),
    );

    expect(graph.catalog.serverFunctionFamilies).toEqual([
      'demo.users.authenticated-list',
      'demo.users.list',
    ]);
    expect(graph.serverFunctionFamily('demo.users.list').kind).toBe(
      'server-function-family',
    );
    expect(
      graph.serverFunctionFamily('demo.users.authenticated-list').kind,
    ).toBe('server-function-family');
    expect(() => assertServerFunctionArchitecture(graph.graph)).not.toThrow();
  });
});

function configureServerFunctionTransport(serverUrl: string): void {
  TestBed.configureTestingModule({
    providers: [
      provideServerFunctionTransport(async ({ id, input }) => {
        const response = await fetch(`${serverUrl}/__server-functions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id, input }),
        });
        const body = (await response.json()) as unknown;
        if (response.ok) return body;

        return craftException(
          {
            _tag: 'HttpError',
            scope: 'ServerFunctionClient',
            identifier: id,
          },
          {
            id,
            status: response.status,
            statusText: response.statusText,
            body,
          },
        );
      }),
    ],
  });
}
