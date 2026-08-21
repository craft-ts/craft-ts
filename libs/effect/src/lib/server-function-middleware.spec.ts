import { Context, Effect, Exit, Layer, Schema } from 'effect';
import { createServer, portableServerFunction } from '@craft-ts/core';
import { describe, expect, it } from 'vitest';
import {
  composeEffect,
  effectServerMiddleware,
  executeEffect,
} from './server-function-middleware';

const inputSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'effect-middleware-test',
    types: undefined,
    validate(value: unknown) {
      return typeof value === 'object' && value !== null && 'value' in value
        ? { value: value as { readonly value: string } }
        : { issues: [{ message: 'value expected' }] };
    },
  },
};

const typedInputSchema = Schema.toStandardSchemaV1(
  Schema.Struct({
    filter: Schema.String,
    simulateError: Schema.Union([
      Schema.Literal('none'),
      Schema.Literal('middleware'),
      Schema.Literal('handler'),
    ]),
  }),
);

class Greeting extends Context.Service<Greeting, { readonly prefix: string }>()(
  'Greeting',
) {}

describe('Effect server-function middleware adapter', () => {
  it('composes with Effect.pipe and preserves an after hook', async () => {
    const trace: string[] = [];
    const withAudit = effectServerMiddleware('effect.audit', ({ next }) =>
      Effect.gen(function* () {
        trace.push('before');
        const exit = yield* Effect.exit(next());
        trace.push(`after:${Exit.isSuccess(exit)}`);
        return yield* exit;
      }),
    );
    const program = Effect.succeed('ok').pipe(withAudit);

    await expect(Effect.runPromise(program)).resolves.toBe('ok');
    expect(trace).toEqual(['before', 'after:true']);
  });

  it('uses Layer/provide only in the Effect adapter', async () => {
    const withGreeting = effectServerMiddleware('effect.greeting', ({ next }) =>
      Effect.gen(function* () {
        const greeting = yield* Greeting;
        const value = yield* next();
        return `${greeting.prefix}${value}`;
      }),
    );
    const program = composeEffect([withGreeting], Effect.succeed('Ada'));
    const adapter = executeEffect(Layer.succeed(Greeting)({ prefix: 'Hi ' }));

    await expect(adapter.run(program)).resolves.toBe('Hi Ada');
  });

  it('is accepted by the portable registry and receives the Effect program', async () => {
    const withAudit = effectServerMiddleware(
      'effect.registry-audit',
      ({ next }) =>
        Effect.gen(function* () {
          yield* Effect.log('before');
          const value = yield* next();
          return `${value}:audited`;
        }),
    );
    const fn = portableServerFunction('effect.registry', inputSchema)
      .use(withAudit)
      .handler(({ input }) => Effect.succeed(input.value));
    const server = createServer({
      functions: [fn],
      execute: executeEffect().run,
    });

    await expect(
      server.invoke('effect.registry', { value: 'Ada' }),
    ).resolves.toBe('Ada:audited');
  });

  it('preserves the server-function input type after an Effect middleware', async () => {
    const withAudit = effectServerMiddleware(
      'effect.typed-input-audit',
      ({ next }) =>
        Effect.gen(function* () {
          return yield* next();
        }),
    );
    const fn = portableServerFunction('effect.typed-input', typedInputSchema)
      .use(withAudit)
      // The handler must retain the contract schema after `.use(withAudit)`.
      // These assignments are compile-time regression guards.
      .handler(({ input }) => {
        const filter: string = input.filter;
        const mode: 'none' | 'middleware' | 'handler' = input.simulateError;
        return Effect.succeed(`${filter}:${mode}`);
      });

    expect(fn.kind).toBe('server-function');
  });
});
