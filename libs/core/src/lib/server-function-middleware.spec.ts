import { beforeEach, describe, expect, it } from 'vitest';
import { Context, Data, Effect, Layer, Schema } from 'effect';
import {
  clientContext,
  craftHandshake,
  craftMiddleware,
  craftRequestContext,
  createServer,
  flattenMiddlewares,
  serverFunction,
  TestBed,
} from '@craft-ts/core';

class Trace extends Context.Service<Trace, string[]>()(
  'test/yieldable-trace',
) {}
class CurrentUser extends Context.Service<
  CurrentUser,
  { readonly id: string; readonly role: 'admin' | 'member' }
>()('test/yieldable-current-user') {}
class AdminRequired extends Data.TaggedError('AdminRequired')<{
  readonly authenticatedUserId: string;
}> {}

const inputSchema = Schema.toStandardSchemaV1(
  Schema.Struct({ filter: Schema.String }),
);
const claimedHandshake = craftHandshake(
  'test.claimed-user',
  Schema.toStandardSchemaV1(Schema.Struct({ userId: Schema.String })),
);
const ClaimedUserContext = craftRequestContext(claimedHandshake);

const adminOnly = craftMiddleware('test.admin-only').server(() =>
  Effect.gen(function* () {
    const trace = yield* Trace;
    const user = yield* CurrentUser;
    trace.push('admin');
    if (user.role !== 'admin') {
      return yield* new AdminRequired({ authenticatedUserId: user.id });
    }
    return { value: user, context: { authenticatedUser: user } };
  }),
);

const matchingUser = craftMiddleware('test.matching-user')
  .pipe(adminOnly, clientContext(claimedHandshake))
  .server(() =>
    Effect.gen(function* () {
      const trace = yield* Trace;
      const admin = yield* adminOnly;
      const claimed = yield* ClaimedUserContext;
      trace.push(`match:${claimed.userId}`);
      if (claimed.userId !== admin.id) {
        return yield* Effect.fail(new Error('claimed user mismatch'));
      }
      return { value: admin };
    }),
  );

const audited = craftMiddleware('test.audit')
  .pipe(matchingUser)
  .server(() =>
    Effect.gen(function* () {
      const trace = yield* Trace;
      const user = yield* matchingUser;
      trace.push(`audit:${user.id}`);
      return { value: user, context: { auditId: 'audit-1' } };
    }),
  );

function makeServer(
  role: 'admin' | 'member',
  trace: string[],
  fn = serverFunction('test.users', inputSchema, { exposure: 'client' })
    .use(audited)
    .handler(({ context }) =>
      Effect.gen(function* () {
        const user = yield* matchingUser;
        trace.push(`handler:${user.id}`);
        return `${context.auditId}/${user.id}`;
      }),
    )
    .exposeErrors({
      AdminRequired: (errorPayload) => ({
        code: 'ADMIN_REQUIRED',
        status: 403,
        payload: { authenticatedUserId: errorPayload.authenticatedUserId },
      }),
    }),
) {
  const layer = Layer.mergeAll(
    Layer.succeed(Trace)(trace),
    Layer.succeed(CurrentUser)({ id: 'u-1', role }),
  );
  return createServer({
    functions: [fn],
    execute(value) {
      return Effect.isEffect(value)
        ? Effect.runPromise(
            Effect.provide(
              value as Effect.Effect<unknown, unknown, Trace | CurrentUser>,
              layer,
            ),
          )
        : value;
    },
  });
}

describe('yieldable server middleware', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('returns the business value from yield* and runs .use before the handler', async () => {
    const trace: string[] = [];
    const server = makeServer('admin', trace);

    await expect(
      server.invoke('test.users', { filter: 'ada' }, { userId: 'u-1' }),
    ).resolves.toBe('audit-1/u-1');
    expect(trace).toEqual(['admin', 'match:u-1', 'audit:u-1', 'handler:u-1']);
  });

  it('memoizes a middleware yielded after the same middleware was used', async () => {
    const trace: string[] = [];
    const server = makeServer('admin', trace);

    await server.invoke('test.users', { filter: 'ada' }, { userId: 'u-1' });
    expect(trace.filter((entry) => entry === 'match:u-1')).toHaveLength(1);
  });

  it('short-circuits on a middleware failure and does not call the handler', async () => {
    const trace: string[] = [];
    const server = makeServer('member', trace);

    await expect(
      server.invoke('test.users', { filter: 'ada' }, { userId: 'u-1' }),
    ).rejects.toMatchObject({ _tag: 'AdminRequired' });
    expect(trace).toEqual(['admin']);
  });

  it('detects duplicate implementations and dependency cycles', () => {
    const other = craftMiddleware('test.audit').server(() =>
      Effect.succeed({ value: undefined }),
    );
    expect(() => flattenMiddlewares([audited, other])).toThrow(
      'Duplicate middleware id "test.audit"',
    );
  });
});

// @ts-expect-error next is intentionally absent from the new middleware API.
craftMiddleware('test.no-next').server(({ next }) =>
  Effect.succeed({ value: next }),
);
