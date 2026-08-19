import { beforeEach, describe, expect, it } from 'vitest';
import { Effect, Schema } from 'effect';
import {
  craftMiddleware,
  clientContext,
  craftUnique,
  craftUse,
  createServer,
  createServerFunctionClient,
  flattenClientMiddlewares,
  requireClientDI,
  runClientMiddlewareChain,
  serverFunction,
  TestBed,
  type ServerFunctionRequest,
} from '@craft-ts/core';
import { SERVICE_YIELD_REQUEST_MARKER } from './craft-generator-runtime';
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
        clientContext([workspaceContext]),
      );
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
      clientContext([sessionContext]),
    );
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

  it('refuse une collision de clé entre middleware client et requireClientDI', async () => {
    const UserId = new InjectionToken<string>('userId');
    const requirement = requireClientDI(UserId);
    const listUsers = serverFunction('client-ctx.collision', filterSchema, {
      exposure: 'client',
      clientContext: sessionSchema,
    })
      .pipe(requirement)
      .handler(({ input }) => input.filter);
    const { provideServerFunctionTransport } = await import('@craft-ts/core');
    TestBed.configureTestingModule({
      providers: [
        { provide: UserId, useValue: 'u-1' },
        provideServerFunctionTransport(async () => 'ada'),
      ],
    });
    const client = createServerFunctionClient<typeof listUsers>(
      craftUnique('client-ctx.collision'),
      clientContext([sessionContext, requirement]),
    );

    await expect(
      TestBed.runInInjectionContext(() => client({ filter: 'ada' })),
    ).rejects.toThrow('CRAFT_CLIENT_FUNCTION_CONTEXT_COLLISION');
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
      clientContext([liar]),
    );

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
  clientContext([workspaceContext]),
);

createServerFunctionClient<typeof typedFunction>(
  craftUnique('client-ctx.typing'),
  // @ts-expect-error la chaîne attachée ne publie pas `workspaceId`
  clientContext([sessionContext]),
);

// @ts-expect-error rien n'est attaché alors que la fonction attend un contexte
createServerFunctionClient<typeof typedFunction>(
  craftUnique('client-ctx.typing'),
);

const diFunction = serverFunction('client-ctx.typing-di', filterSchema, {
  exposure: 'client',
})
  .pipe(requireClientDI(new InjectionToken<{ id: string }>('TypedUser')))
  .handler(({ input, required }) => input.filter + required.name);

// @ts-expect-error un pipe requireClientDI doit être rejoué côté client
createServerFunctionClient<typeof diFunction>(
  craftUnique('client-ctx.typing-di'),
);
