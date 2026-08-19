import { beforeEach, describe, expect, it } from 'vitest';
import {
  craftException,
  isCraftException,
  provideServerFunctionTransport,
  readServerFunctionFailure,
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
import { provideClaimedUserId } from './shared/claimed-user-id';
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
      // L'identité annoncée ne fait plus partie de l'input : elle vient du DI
      // navigateur et voyage dans le canal `context`.
      configureServerFunctionTransport(server.url, 'other-user');

      const result = await TestBed.runInInjectionContext(() =>
        getAuthenticatedUsers({ filter: 'ada' }),
      );

      expect(isCraftException(result)).toBe(true);
      expect(result).toMatchObject({
        _tag: 'AuthenticatedUserMismatch',
        scope: 'ServerFunction',
        identifier: 'demo.users.authenticated-list',
        payload: {
          requestedUserId: 'other-user',
          authenticatedUserId: 'user-ada',
        },
      });
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
        getAuthenticatedUsers({ filter: 'ada' }),
      );

      expect(isCraftException(result)).toBe(true);
      expect(result).toMatchObject({
        _tag: 'AdminRequired',
        scope: 'ServerFunction',
        payload: { role: 'member' },
      });
    } finally {
      await server.close();
    }
  });

  it('transporte le contexte client validé, et le refuse quand il manque', async () => {
    const server = await listenDemoServer();
    try {
      const sent: unknown[] = [];
      configureServerFunctionTransport(server.url, 'user-ada', sent);

      const users = await TestBed.runInInjectionContext(() =>
        getAuthenticatedUsers({ filter: 'ada' }),
      );
      expect(users).toEqual([
        { id: 1, name: 'Ada Lovelace', email: 'ada@craft.dev' },
      ]);
      // Le pipe `requireClientDI` et la chaîne `*.mw-client.ts` alimentent le
      // même canal, versionné, séparé de l'input.
      expect(sent).toEqual([
        {
          id: 'demo.users.authenticated-list',
          input: { filter: 'ada' },
          context: {
            requestedBy: 'user-ada',
            locale: expect.any(String),
            userId: 'user-ada',
          },
          protocolVersion: 1,
        },
      ]);

      // Une requête forgée sans contexte est refusée par le registre, avec son
      // propre code : ce n'est pas une donnée métier invalide.
      const response = await fetch(`${server.url}/__server-functions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'demo.users.authenticated-list',
          input: { filter: 'ada' },
        }),
      });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          message: expect.stringContaining(
            'CRAFT_SERVER_FUNCTION_CLIENT_CONTEXT_INVALID',
          ),
        },
      });
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
    // Construire le programme TypeScript de la démo dépasse le timeout par
    // défaut : il croît avec le nombre de fichiers analysés.
  }, 60_000);
});

function configureServerFunctionTransport(
  serverUrl: string,
  claimedUserId = 'user-ada',
  sent: unknown[] = [],
): void {
  TestBed.configureTestingModule({
    providers: [
      provideClaimedUserId(() => claimedUserId),
      provideServerFunctionTransport(async (request) => {
        const { id } = request;
        sent.push(request);
        const response = await fetch(`${serverUrl}/__server-functions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
        });
        const body = (await response.json()) as unknown;
        if (response.ok) return body;

        // Échec métier tagué : on le rejoue tel quel, comme le transport par défaut.
        const failure = readServerFunctionFailure(body);
        if (failure) {
          return craftException(
            { _tag: failure._tag, scope: 'ServerFunction', identifier: id },
            failure,
          );
        }

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
