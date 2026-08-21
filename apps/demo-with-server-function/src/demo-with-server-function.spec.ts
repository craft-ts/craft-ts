import { beforeEach, describe, expect, it } from 'vitest';
import {
  craftException,
  isCraftException,
  provideServerFunctionTransport,
  readServerFunctionFailure,
  type ServerFunctionInput,
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
import { getPortableUsers } from './users/portable-list.fn-client';
import { getEffectMiddlewareUsers } from './users/effect-middleware-list.fn-client';
import { getPublicProducts } from './products/public-products.fn-client';
import type { effectMiddlewareListUsers as ServerEffectMiddlewareListUsers } from './users/effect-middleware-list.fn-serveur';
import { provideClaimedUserId } from './shared/claimed-user-id';
import { demoAuthenticatedUser } from './server/authentication';
import { listenDemoServer } from './server/server';

const demoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Compile-time regression guard: an Effect middleware with no input schema
// must not widen the server-function contract to `object`.
const effectMiddlewareInputRegression: ServerFunctionInput<
  typeof ServerEffectMiddlewareListUsers
> = { filter: 'ada', simulateError: 'none' };
void effectMiddlewareInputRegression;

describe('demo with server function', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('calls the public server function with no middleware', async () => {
    const server = await listenDemoServer();
    try {
      configureServerFunctionTransport(server.url);

      const products = await TestBed.runInInjectionContext(() =>
        getPublicProducts({}),
      );

      expect(products).toEqual([
        expect.objectContaining({ id: 'craft-starter', available: true }),
        expect.objectContaining({ id: 'craft-pro', available: true }),
        expect.objectContaining({ id: 'runtime-pass', available: false }),
      ]);
    } finally {
      await server.close();
    }
  });

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

  it('returns a 404 exception when the public list has no matching users', async () => {
    const server = await listenDemoServer();
    try {
      configureServerFunctionTransport(server.url);
      const response = await fetch(`${server.url}/__server-functions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'demo.users.list',
          input: { filter: 'does-not-exist' },
        }),
      });
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          _tag: 'UsersNotFound',
          payload: { status: 404, filter: 'does-not-exist' },
        },
      });

      const result = await TestBed.runInInjectionContext(() =>
        getUsers({ filter: 'does-not-exist' }),
      );
      expect(result).toMatchObject({
        _tag: 'UsersNotFound',
        scope: 'ServerFunction',
        identifier: 'demo.users.list',
        payload: {
          payload: { status: 404, filter: 'does-not-exist' },
        },
      });
      expect(isCraftException(result)).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('calls the portable layer pipeline through the same registry', async () => {
    const server = await listenDemoServer();
    try {
      configureServerFunctionTransport(server.url);

      const response = await TestBed.runInInjectionContext(() =>
        getPortableUsers({ filter: ' Ada ' }),
      );

      // Chaque champ vient d'une couche différente du `.pipe(...)` : l'audit,
      // la dérivation pure, puis le programme Promise qui charge la base.
      expect(response).toMatchObject({
        filter: 'ada',
        users: [{ id: 1, name: 'Ada Lovelace', email: 'ada@craft.dev' }],
      });
      if (!('auditId' in response) || !('scanned' in response)) {
        throw new Error('portable list returned an error');
      }
      expect(typeof response.auditId).toBe('string');
      expect(response.scanned).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
  });

  it('calls the Effect middleware example through the same registry', async () => {
    const server = await listenDemoServer();
    try {
      configureServerFunctionTransport(server.url);

      const users = await TestBed.runInInjectionContext(() =>
        getEffectMiddlewareUsers({ filter: 'ada', simulateError: 'none' }),
      );

      expect(users).toEqual([
        { id: 1, name: 'Ada Lovelace', email: 'ada@craft.dev' },
      ]);
    } finally {
      await server.close();
    }
  });

  it('renders typed server failures from the Effect middleware and handler', async () => {
    const server = await listenDemoServer();
    try {
      configureServerFunctionTransport(server.url);

      const middlewareFailure = await TestBed.runInInjectionContext(() =>
        getEffectMiddlewareUsers({
          filter: 'ada',
          simulateError: 'middleware',
        }),
      );
      expect(middlewareFailure).toMatchObject({
        _tag: 'DemoMiddlewareFailure',
        payload: {
          DemoMiddlewareFailure: { layer: 'effectAudit' },
        },
      });
      expect(isCraftException(middlewareFailure)).toBe(true);

      const handlerFailure = await TestBed.runInInjectionContext(() =>
        getEffectMiddlewareUsers({ filter: 'ada', simulateError: 'handler' }),
      );
      expect(handlerFailure).toMatchObject({
        _tag: 'DemoHandlerFailure',
        payload: {
          DemoHandlerFailure: { operation: 'UserRepository.list' },
        },
      });
      expect(isCraftException(handlerFailure)).toBe(true);
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

  it('returns a 404 exception when authenticated-list has no matching users', async () => {
    const server = await listenDemoServer();
    try {
      configureServerFunctionTransport(server.url);
      const response = await fetch(`${server.url}/__server-functions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'demo.users.authenticated-list',
          input: { filter: 'does-not-exist' },
          context: {
            requestedBy: 'user-ada',
            locale: 'fr-FR',
            userId: 'user-ada',
          },
          protocolVersion: 1,
        }),
      });
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          _tag: 'AuthenticatedUsersNotFound',
          payload: { status: 404 },
        },
      });

      const result = await TestBed.runInInjectionContext(() =>
        getAuthenticatedUsers({ filter: 'does-not-exist' }),
      );
      expect(result).toMatchObject({
        _tag: 'AuthenticatedUsersNotFound',
        payload: {
          payload: { status: 404 },
        },
      });
      expect(isCraftException(result)).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('is visible as valid server-function families', () => {
    const graph = createArchitectureGraph(
      analyzeDependencyGraph({
        rootDir: demoRoot,
        tsConfigFilePath: 'tsconfig.json',
      }),
    );

    expect(graph.catalog.serverFunctionFamilies).toEqual([
      'demo.products.list',
      'demo.users.authenticated-list',
      'demo.users.effect-middleware-list',
      'demo.users.list',
      'demo.users.portable-list',
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
