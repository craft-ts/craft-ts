import { beforeEach, describe, expect, it } from 'vitest';
import { Effect, Schema } from 'effect';
import {
  craftClientMiddleware,
  craftHandshake,
  craftHandshakeMiddleware,
  craftMiddleware,
  craftUnique,
  craftUse,
  createServer,
  createServerFunctionClient,
  flattenClientMiddlewares,
  runClientMiddlewareChain,
  serverFunction,
  TestBed,
  type ServerFunctionRequest,
} from '@craft-ts/core';
import { SERVICE_YIELD_REQUEST_MARKER } from './craft-generator-runtime';
import { inject, type InjectionToken as Token } from './host/craft-compat';

/** Lecture DI minimale, dans l'esprit d'un `yield*` de service craft. */
function injectRequest<Value>(token: Token<Value>) {
  return {
    [SERVICE_YIELD_REQUEST_MARKER]: true,
    providedIn: 'global',
    resolve: () => inject(token),
  } as const;
}
import { InjectionToken } from './host/craft-compat';

const sessionSchema = Schema.toStandardSchemaV1(
  Schema.Struct({ userId: Schema.String }),
);
const workspaceSchema = Schema.toStandardSchemaV1(
  Schema.Struct({ workspaceId: Schema.String }),
);
const clientContextSchema = Schema.toStandardSchemaV1(
  Schema.Struct({ userId: Schema.String, workspaceId: Schema.String }),
);
const filterSchema = Schema.toStandardSchemaV1(
  Schema.Struct({ filter: Schema.String }),
);

/** Dépendance résolue par le runtime craft, comme n'importe quel `yield*`. */
const currentUserRequest = {
  [SERVICE_YIELD_REQUEST_MARKER]: true,
  providedIn: 'global',
  resolve: () => ({ id: 'u-1' }),
} as const;

const trace: string[] = [];

const sessionContext = craftMiddleware('demo.session')
  .provides(sessionSchema)
  .client(function* ({ next }) {
    const user = (yield currentUserRequest) as { id: string };
    trace.push('session:before');
    const result = yield* next({ context: { userId: user.id } });
    trace.push('session:after');
    return result;
  });

const workspaceContext = craftMiddleware('demo.workspace')
  .use(sessionContext)
  .provides(workspaceSchema)
  .client(function* ({ context, next }) {
    trace.push(`workspace:before actor=${context.userId}`);
    const result = yield* next({ context: { workspaceId: `ws-${context.userId}` } });
    trace.push('workspace:after');
    return result;
  });

describe('client function middleware', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    trace.length = 0;
  });

  it('aplatit les dépendances transitives, dédupliquées, dépendance d’abord', () => {
    expect(flattenClientMiddlewares([workspaceContext]).map((m) => m.id)).toEqual(
      ['demo.session', 'demo.workspace'],
    );
    expect(
      flattenClientMiddlewares([sessionContext, workspaceContext]).map(
        (m) => m.id,
      ),
    ).toEqual(['demo.session', 'demo.workspace']);
  });

  it('rejette deux middleware client de même id et d’implémentation différente', () => {
    const other = craftMiddleware('demo.workspace').client(function* ({ next }) {
      return yield* next({ context: {} });
    });
    expect(() =>
      flattenClientMiddlewares([workspaceContext, other]),
    ).toThrow('Duplicate middleware id "demo.workspace"');
  });

  it('exécute la chaîne en oignon et relaie les dépendances au runtime craft', () => {
    const context = craftUse(
      runClientMiddlewareChain([workspaceContext], { filter: 'ada' }),
    );

    expect(context).toEqual({ userId: 'u-1', workspaceId: 'ws-u-1' });
    expect(trace).toEqual([
      'session:before',
      'workspace:before actor=u-1',
      'workspace:after',
      'session:after',
    ]);
  });

  it('refuse de mélanger un middleware serveur et un middleware client', () => {
    const serverSide = craftMiddleware('demo.server-side').server(({ next }) =>
      next({ context: {} }),
    );

    expect(() =>
      craftMiddleware('demo.mixed')
        .use(serverSide)
        .client(function* ({ next }) {
          return yield* next({ context: {} });
        }),
    ).toThrow('A chain cannot mix both families.');
  });

  it('transporte le contexte client, le valide, et l’expose séparément au handler', async () => {
    const listUsers = serverFunction('client-ctx.list', filterSchema, {
      exposure: 'client',
      clientContext: clientContextSchema,
    }).handler(({ input, clientContext }) =>
      Effect.succeed(
        `${input.filter}/${clientContext.userId}/${clientContext.workspaceId}`,
      ),
    );
    const sent: ServerFunctionRequest[] = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: new InjectionToken<never>('unused'),
          useValue: undefined,
        },
      ],
    });
    const server = createServer({
      functions: [listUsers],
      execute: (value) =>
        Effect.isEffect(value)
          ? Effect.runPromise(value as Effect.Effect<unknown>)
          : value,
    });

    await expect(
      server.invoke(
        'client-ctx.list',
        { filter: 'ada' },
        { userId: 'u-1', workspaceId: 'ws-u-1' },
      ),
    ).resolves.toBe('ada/u-1/ws-u-1');

    // Le contexte annoncé mais absent est refusé, avec son propre code.
    await expect(
      server.invoke('client-ctx.list', { filter: 'ada' }),
    ).rejects.toThrow('CRAFT_SERVER_FUNCTION_CLIENT_CONTEXT_INVALID');
    // Un contexte incomplet aussi : la validation est celle du serveur.
    await expect(
      server.invoke('client-ctx.list', { filter: 'ada' }, { userId: 'u-1' }),
    ).rejects.toThrow('CRAFT_SERVER_FUNCTION_CLIENT_CONTEXT_INVALID');

    // Bout en bout : la façade client construit le contexte via la chaîne.
    TestBed.resetTestingModule();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((_url: unknown, init: { body: string }) => {
      sent.push(JSON.parse(init.body) as ServerFunctionRequest);
      return server.handle(
        new Request('http://localhost/__server-functions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: init.body,
        }),
      );
    }) as typeof globalThis.fetch;
    const { provideDefaultServerFunctionTransport } = await import(
      '@craft-ts/core'
    );
    TestBed.configureTestingModule({
      providers: [provideDefaultServerFunctionTransport()],
    });

    try {
      const client = createServerFunctionClient<typeof listUsers>(
        craftUnique('client-ctx.list'),
      ).pipe(craftClientMiddleware(workspaceContext));
      await expect(
        TestBed.runInInjectionContext(() => client({ filter: 'ada' })),
      ).resolves.toBe('ada/u-1/ws-u-1');
      expect(sent).toEqual([
        {
          id: 'client-ctx.list',
          input: { filter: 'ada' },
          context: { userId: 'u-1', workspaceId: 'ws-u-1' },
          protocolVersion: 1,
        },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('remonte le schéma de contexte client déclaré par un middleware serveur', async () => {
    const claimed = craftMiddleware('demo.claimed-user')
      .clientContext(sessionSchema)
      .server(({ clientContext, next }) =>
        Effect.gen(function* () {
          // Le middleware confronte la déclaration du navigateur à « la vraie
          // session » : c'est tout l'intérêt d'un canal séparé.
          if (clientContext.userId !== 'u-1') {
            return yield* Effect.fail(new Error('mismatch'));
          }
          return yield* next({ context: { actor: clientContext.userId } });
        }),
      );
    const listUsers = serverFunction('client-ctx.claimed', filterSchema, {
      exposure: 'client',
    })
      .use(claimed)
      .handler(({ context, clientContext }) =>
        Effect.succeed(`${context.actor}/${clientContext.userId}`),
      );
    const server = createServer({
      functions: [listUsers],
      execute: (value) =>
        Effect.isEffect(value)
          ? Effect.runPromise(value as Effect.Effect<unknown>)
          : value,
    });

    await expect(
      server.invoke('client-ctx.claimed', { filter: 'ada' }, { userId: 'u-1' }),
    ).resolves.toBe('u-1/u-1');
    await expect(
      server.invoke('client-ctx.claimed', { filter: 'ada' }, { userId: 'u-2' }),
    ).rejects.toThrow('mismatch');
    await expect(
      server.invoke('client-ctx.claimed', { filter: 'ada' }, {}),
    ).rejects.toThrow('CRAFT_SERVER_FUNCTION_CLIENT_CONTEXT_INVALID');

    // Et la façade client doit couvrir ce que le middleware exige.
    createServerFunctionClient<typeof listUsers>(
      craftUnique('client-ctx.claimed'),
    ).pipe(craftClientMiddleware(sessionContext));
  });

  it('garde le format historique quand aucun contexte client n’est attendu', async () => {
    const listUsers = serverFunction('client-ctx.legacy', filterSchema, {
      exposure: 'client',
    }).handler(({ input }) => input.filter);
    const requests: ServerFunctionRequest[] = [];
    const { provideServerFunctionTransport } = await import('@craft-ts/core');
    TestBed.configureTestingModule({
      providers: [
        provideServerFunctionTransport(async (request) => {
          requests.push(request);
          return 'ada';
        }),
      ],
    });
    const client = createServerFunctionClient<typeof listUsers>(
      craftUnique('client-ctx.legacy'),
    );

    await expect(
      TestBed.runInInjectionContext(() => client({ filter: 'ada' })),
    ).resolves.toBe('ada');
    expect(requests).toEqual([
      { id: 'client-ctx.legacy', input: { filter: 'ada' } },
    ]);

    // Et le registre accepte toujours une requête sans contexte.
    const server = createServer({ functions: [listUsers] });
    await expect(
      server.invoke('client-ctx.legacy', { filter: 'ada' }),
    ).resolves.toBe('ada');
  });

  it('implémente un handshake en une déclaration, lue comme un service', async () => {
    const UserId = new InjectionToken<string>('userId');
    const claimedUser = craftHandshake('client-ctx.claimed-user', sessionSchema);
    const claimedUserContext = craftHandshakeMiddleware(
      claimedUser,
      function* () {
        return { userId: (yield injectRequest(UserId)) as string };
      },
    );
    const listUsers = serverFunction('client-ctx.handshake', filterSchema, {
      exposure: 'client',
      clientContext: claimedUser,
    }).handler(({ input, clientContext: claims }) =>
      Effect.succeed(`${input.filter}/${claims.userId}`),
    );
    const sent: ServerFunctionRequest[] = [];
    const { provideServerFunctionTransport } = await import('@craft-ts/core');
    TestBed.configureTestingModule({
      providers: [
        { provide: UserId, useValue: 'u-1' },
        provideServerFunctionTransport(async (request) => {
          sent.push(request);
          return 'ok';
        }),
      ],
    });
    // Le middleware tient son id et son schéma du handshake : rien n'est répété.
    expect(claimedUserContext.id).toBe('client-ctx.claimed-user');
    expect(claimedUserContext.provides).toEqual([claimedUser]);

    const client = createServerFunctionClient<typeof listUsers>(
      craftUnique('client-ctx.handshake'),
    ).pipe(craftClientMiddleware(claimedUserContext));
    await expect(
      TestBed.runInInjectionContext(() => client({ filter: 'ada' })),
    ).resolves.toBe('ok');
    expect(sent).toEqual([
      {
        id: 'client-ctx.handshake',
        input: { filter: 'ada' },
        context: { userId: 'u-1' },
        protocolVersion: 1,
      },
    ]);
  });

  it('refuse un contexte que la chaîne client n’a pas honoré', async () => {
    const liar = craftMiddleware('demo.liar')
      .provides(workspaceSchema)
      .client(function* ({ next }) {
        return yield* next({ context: {} as { workspaceId: string } });
      });
    const listUsers = serverFunction('client-ctx.liar', filterSchema, {
      exposure: 'client',
      clientContext: workspaceSchema,
    }).handler(({ input }) => input.filter);
    const { provideServerFunctionTransport } = await import('@craft-ts/core');
    TestBed.configureTestingModule({
      providers: [provideServerFunctionTransport(async () => 'ada')],
    });
    const client = createServerFunctionClient<typeof listUsers>(
      craftUnique('client-ctx.liar'),
    ).pipe(craftClientMiddleware(liar));

    await expect(
      TestBed.runInInjectionContext(() => client({ filter: 'ada' })),
    ).rejects.toThrow('CRAFT_CLIENT_FUNCTION_CONTEXT_INVALID');
  });
});

// --- garde-fous de typage (vérifiés par tsc, pas au runtime) ---------------

const typedFunction = serverFunction('client-ctx.typing', filterSchema, {
  exposure: 'client',
  clientContext: clientContextSchema,
}).handler(({ clientContext }) =>
  Effect.succeed(
    `${clientContext.userId satisfies string}${clientContext.workspaceId satisfies string}`,
  ),
);

createServerFunctionClient<typeof typedFunction>(
  craftUnique('client-ctx.typing'),
).pipe(craftClientMiddleware(workspaceContext));

// @ts-expect-error la chaîne attachée ne publie pas `workspaceId`
createServerFunctionClient<typeof typedFunction>(
  craftUnique('client-ctx.typing'),
).pipe(craftClientMiddleware(sessionContext));

// @ts-expect-error rien n'est attaché alors que la fonction attend un contexte
createServerFunctionClient<typeof typedFunction>(
  craftUnique('client-ctx.typing'),
).pipe(craftClientMiddleware());

// Un handshake porte le nom et la forme : le middleware ne répète ni l'un ni
// l'autre, et son contexte doit couvrir ce que la fonction attend.
const typedHandshake = craftHandshake('client-ctx.typed', workspaceSchema);
const typedHandshakeContext = craftHandshakeMiddleware(
  typedHandshake,
  function* () {
    return { workspaceId: 'ws-1' };
  },
);
const handshakeFunction = serverFunction('client-ctx.typing-hs', filterSchema, {
  exposure: 'client',
  clientContext: typedHandshake,
}).handler(({ clientContext: claims }) =>
  Effect.succeed(claims.workspaceId satisfies string),
);

createServerFunctionClient<typeof handshakeFunction>(
  craftUnique('client-ctx.typing-hs'),
).pipe(craftClientMiddleware(typedHandshakeContext));

// @ts-expect-error la chaîne attachée ne publie pas `workspaceId`
createServerFunctionClient<typeof handshakeFunction>(
  craftUnique('client-ctx.typing-hs'),
).pipe(craftClientMiddleware(sessionContext));
