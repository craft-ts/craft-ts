import { beforeEach, describe, expect, it } from 'vitest';
import { Context, Data, Effect, Exit, Layer, Schema } from 'effect';
import {
  clientContext,
  craftMiddleware,
  createServer,
  createServerFunctionClient,
  createServerFunctionFactory,
  craftUnique,
  flattenMiddlewares,
  isCraftException,
  provideDefaultServerFunctionTransport,
  serverFunction,
  TestBed,
} from '@craft-ts/core';

class Trace extends Context.Service<Trace, string[]>()('test/Trace') {}
class CurrentUser extends Context.Service<
  CurrentUser,
  { readonly id: string; readonly role: 'admin' | 'member' }
>()('test/CurrentUser') {}

class AdminRequired extends Data.TaggedError('AdminRequired')<{
  readonly authenticatedUserId: string;
}> {}
class TenantSuspended extends Data.TaggedError('TenantSuspended')<{
  readonly tenantId: string;
}> {}

const tenantSchema = Schema.toStandardSchemaV1(
  Schema.Struct({ tenantId: Schema.String }),
);
const filterSchema = Schema.toStandardSchemaV1(
  Schema.Struct({ filter: Schema.String }),
);

/** Valide un fragment d'input, court-circuite, publie `user` et `tenantId`. */
const authenticated = craftMiddleware('auth.authenticated')
  .input(tenantSchema)
  .server(({ input, next }) =>
    Effect.gen(function* () {
      const trace = yield* Trace;
      const user = yield* CurrentUser;
      trace.push('auth:before');
      if (user.role !== 'admin') {
        return yield* new AdminRequired({ authenticatedUserId: user.id });
      }
      const result = yield* next({ context: { user, tenantId: input.tenantId } });
      trace.push('auth:after');
      return result;
    }),
  );

const claimedUserSchema = Schema.toStandardSchemaV1(
  Schema.Struct({ userId: Schema.String }),
);

/** Le pipe accumule le contexte serveur et le contrat de contexte client. */
const authenticatedWithClaim = craftMiddleware('auth.authenticated-with-claim')
  .pipe(authenticated, clientContext(claimedUserSchema))
  .server(({ clientContext, context, next }) =>
    Effect.gen(function* () {
      if (clientContext.userId !== context.user.id) {
        return yield* new AdminRequired({
          authenticatedUserId: context.user.id,
        });
      }
      return yield* next({ context: { verifiedUserId: clientContext.userId } });
    }),
  );

/** Un enrichissement direct avance automatiquement sans appeler `next()`. */
const directContext = craftMiddleware('request.direct-context').server(() => ({
  context: { requestId: 'request-1' },
}));
const directAsyncContext = craftMiddleware(
  'request.direct-async-context',
).server(async () => ({
  context: { source: 'async' },
}));

/** Dépend du précédent, observe la sortie, peut court-circuiter aussi. */
const audited = craftMiddleware('audit.trail')
  .pipe(authenticated)
  .server(({ context, next }) =>
    Effect.gen(function* () {
      const trace = yield* Trace;
      if (context.tenantId === 'suspended') {
        return yield* new TenantSuspended({ tenantId: context.tenantId });
      }
      trace.push(`audit:before actor=${context.user.id}`);
      const exit = yield* Effect.exit(next({ context: { auditId: 'a-1' } }));
      trace.push(`audit:after failed=${Exit.isFailure(exit)}`);
      return yield* exit;
    }),
  );

const listUsers = serverFunction('users.list', filterSchema, {
  exposure: 'client',
})
  .use(audited)
  .handler(({ input, context }) =>
    Effect.gen(function* () {
      const trace = yield* Trace;
      trace.push(`handler filter=${input.filter} tenant=${input.tenantId}`);
      return `${context.user.id}/${context.auditId}/${input.filter}`;
    }),
  );

function createTestServer(
  role: 'admin' | 'member',
  trace: string[],
  functions = [listUsers],
) {
  const layer = Layer.mergeAll(
    Layer.succeed(Trace)(trace),
    Layer.succeed(CurrentUser)({ id: 'u-1', role }),
  );
  return createServer({
    functions,
    execute(value) {
      if (!Effect.isEffect(value)) return value;
      return Effect.runPromise(
        Effect.provide(
          value as Effect.Effect<unknown, unknown, Trace | CurrentUser>,
          layer,
        ),
      );
    },
  });
}

describe('server function middleware', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('aplatit les dépendances transitives, dédupliquées, dépendance d’abord', () => {
    expect(flattenMiddlewares([audited]).map((m) => m.id)).toEqual([
      'auth.authenticated',
      'audit.trail',
    ]);
    expect(flattenMiddlewares([authenticated, audited]).map((m) => m.id)).toEqual(
      ['auth.authenticated', 'audit.trail'],
    );
  });

  it('rejette deux middleware de même id et d’implémentation différente', () => {
    const other = craftMiddleware('audit.trail').server(({ next }) =>
      next({ context: {} }),
    );
    expect(() => flattenMiddlewares([audited, other])).toThrow(
      'Duplicate middleware id "audit.trail"',
    );
  });

  it('exécute la chaîne en oignon et expose un contexte fusionné au handler', async () => {
    const trace: string[] = [];
    const server = createTestServer('admin', trace);

    await expect(
      server.invoke('users.list', { filter: 'ada', tenantId: 't-1' }),
    ).resolves.toBe('u-1/a-1/ada');

    expect(trace).toEqual([
      'auth:before',
      'audit:before actor=u-1',
      'handler filter=ada tenant=t-1',
      'audit:after failed=false',
      'auth:after',
    ]);
  });

  it('valide et fusionne le schéma du middleware avec celui du contrat', async () => {
    const trace: string[] = [];
    const server = createTestServer('admin', trace);

    // `tenantId` vient du middleware : son absence est une erreur de validation.
    await expect(
      server.invoke('users.list', { filter: 'ada' }),
    ).rejects.toThrow('CRAFT_SERVER_FUNCTION_INPUT_INVALID');
  });

  it('accumule les middleware et le clientContext avec pipe', async () => {
    const piped = serverFunction('users.piped', filterSchema, {
      exposure: 'client',
    })
      .use(authenticatedWithClaim)
      .handler(({ input, context }) =>
        Effect.succeed(`${context.verifiedUserId}/${input.filter}`),
      );
    const trace: string[] = [];
    const server = createTestServer('admin', trace, [piped] as never);

    await expect(
      server.invoke(
        'users.piped',
        { filter: 'ada', tenantId: 't-1' },
        { userId: 'u-1' },
      ),
    ).resolves.toBe('u-1/ada');

    await expect(
      server.invoke(
        'users.piped',
        { filter: 'ada', tenantId: 't-1' },
        { userId: 'u-2' },
      ),
    ).rejects.toMatchObject({ _tag: 'AdminRequired' });
  });

  it('avance automatiquement avec un contexte retourné directement', async () => {
    const fn = serverFunction('users.direct-context', filterSchema)
      .use(directContext)
      .use(directAsyncContext)
      .handler(({ context }) => {
        const requestId: string = context.requestId;
        const source: string = context.source;
        return Effect.succeed(`${requestId}/${source}`);
      });
    const server = createTestServer('admin', [], [fn] as never);

    await expect(
      server.invoke('users.direct-context', { filter: 'ada' }),
    ).resolves.toBe('request-1/async');
  });

  it('remonte l’échec d’un middleware sans exécuter la suite', async () => {
    const trace: string[] = [];
    const server = createTestServer('member', trace);

    await expect(
      server.invoke('users.list', { filter: 'ada', tenantId: 't-1' }),
    ).rejects.toMatchObject({ _tag: 'AdminRequired' });
    expect(trace).toEqual(['auth:before']);
  });

  it('laisse le hook après observer un échec aval puis le relaie', async () => {
    const trace: string[] = [];
    const failing = serverFunction('users.failing', filterSchema)
      .use(audited)
      .handler(() => Effect.fail(new TenantSuspended({ tenantId: 'x' })));
    const server = createTestServer('admin', trace, [failing] as never);

    await expect(
      server.invoke('users.failing', { filter: 'ada', tenantId: 't-1' }),
    ).rejects.toMatchObject({ _tag: 'TenantSuspended' });
    expect(trace).toEqual([
      'auth:before',
      'audit:before actor=u-1',
      'audit:after failed=true',
    ]);
  });

  it('signale un schéma non fusionnable quand plusieurs schémas sont combinés', async () => {
    const scalarSchema = Schema.toStandardSchemaV1(Schema.String);
    const scalar = serverFunction('users.scalar', scalarSchema)
      .use(authenticated)
      .handler(({ input }) => Effect.succeed(input));
    const server = createTestServer('admin', [], [scalar] as never);

    await expect(server.invoke('users.scalar', 'ada')).rejects.toThrow(
      'CRAFT_SERVER_FUNCTION_INPUT_NOT_MERGEABLE',
    );
  });

  it('sérialise l’échec tagué en 422 et le rejoue en CraftException côté client', async () => {
    const trace: string[] = [];
    const server = createTestServer('member', trace);

    const response = await server.handle(serverRequest('users.list'));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: { _tag: 'AdminRequired', authenticatedUserId: 'u-1' },
    });

    // Transport par défaut branché sur un fetch qui parle au registre : c'est
    // lui qui doit reconstituer l'erreur taguée.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((_url: unknown, init: { body: string }) =>
      server.handle(
        new Request('http://localhost/__server-functions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: init.body,
        }),
      )) as typeof globalThis.fetch;
    TestBed.configureTestingModule({
      providers: [provideDefaultServerFunctionTransport()],
    });

    try {
      const client = createServerFunctionClient<typeof listUsers>(
        craftUnique('users.list'),
      );
      const result = await TestBed.runInInjectionContext(() =>
        client({ filter: 'ada', tenantId: 't-1' } as never),
      );

      expect(isCraftException(result)).toBe(true);
      expect(result).toMatchObject({
        _tag: 'AdminRequired',
        scope: 'ServerFunction',
        identifier: 'users.list',
        payload: { _tag: 'AdminRequired', authenticatedUserId: 'u-1' },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('applique les middleware par défaut d’une createServerFunctionFactory', async () => {
    const trace: string[] = [];
    const appServerFunction = createServerFunctionFactory([audited]);
    const listed = appServerFunction('users.factory', filterSchema, {
      exposure: 'client',
    }).handler(({ input, context }) =>
      Effect.gen(function* () {
        const log = yield* Trace;
        log.push(`factory filter=${input.filter} tenant=${input.tenantId}`);
        return `${context.user.id}/${context.auditId}`;
      }),
    );
    const server = createTestServer('admin', trace, [listed] as never);

    await expect(
      server.invoke('users.factory', { filter: 'ada', tenantId: 't-1' }),
    ).resolves.toBe('u-1/a-1');
    expect(trace).toEqual([
      'auth:before',
      'audit:before actor=u-1',
      'factory filter=ada tenant=t-1',
      'audit:after failed=false',
      'auth:after',
    ]);
  });

  it('renvoie 400 sur un input invalide, sans le confondre avec un échec métier', async () => {
    const server = createTestServer('admin', []);
    const response = await server.handle(
      serverRequest('users.list', { filter: 'ada' }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: expect.stringContaining('CRAFT_SERVER_FUNCTION_INPUT_INVALID') },
    });
  });
});

function serverRequest(
  id: string,
  input: unknown = { filter: 'ada', tenantId: 't-1' },
): Request {
  return new Request('http://localhost/__server-functions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, input }),
  });
}

// --- garde-fous de typage (vérifiés par tsc, pas au runtime) ---------------

serverFunction('users.typing', filterSchema)
  .use(audited)
  .handler(({ input, context }) =>
    Effect.gen(function* () {
      const tenantId = context.tenantId satisfies string;
      const auditId = context.auditId satisfies string;
      const role = context.user.role satisfies 'admin' | 'member';
      // `filter` vient du contrat, `tenantId` du schéma du middleware
      const merged = `${input.filter}${input.tenantId}` satisfies string;
      // @ts-expect-error aucun middleware de la chaîne ne publie `unknownField`
      void context.unknownField;
      return `${tenantId}${auditId}${role}${merged}`;
    }),
  );

serverFunction('users.typing-plain', filterSchema)
  .use(audited)
  // @ts-expect-error un handler non-Effect est refusé dès qu'un middleware est branché
  .handler(({ input }) => input.filter);

// Sans middleware, un handler synchrone reste légal.
serverFunction('users.typing-sync', filterSchema).handler(
  ({ input }) => input.filter,
);
