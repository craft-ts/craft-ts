import { Context, Effect, Layer, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { createServer, serverFunction } from '@craft-ts/core';
import {
  composeEffect,
  effectServerMiddleware,
  executeEffect,
} from './server-function-middleware';

class Greeting extends Context.Service<Greeting, { readonly prefix: string }>()(
  'effect-test/Greeting',
) {}

const inputSchema = Schema.toStandardSchemaV1(
  Schema.Struct({ value: Schema.String }),
);

describe('yieldable Effect middleware adapter', () => {
  it('executes a direct Effect result without a continuation', async () => {
    const trace: string[] = [];
    const audit = effectServerMiddleware('effect.audit', () =>
      Effect.sync(() => {
        trace.push('audit');
        return { value: 'ignored' };
      }),
    );
    const program = composeEffect([audit], Effect.succeed('ok'));

    await expect(Effect.runPromise(program)).resolves.toBe('ok');
    expect(trace).toEqual(['audit']);
  });

  it('keeps Effect DI in the middleware program', async () => {
    const withGreeting = effectServerMiddleware('effect.greeting', () =>
      Effect.gen(function* () {
        const greeting = yield* Greeting;
        return { value: greeting.prefix };
      }),
    );
    const program = composeEffect([withGreeting], Effect.succeed('Ada'));
    const adapter = executeEffect(Layer.succeed(Greeting)({ prefix: 'Hi ' }));

    await expect(adapter.run(program)).resolves.toBe('Ada');
  });

  it('runs the same yieldable middleware in the registry', async () => {
    const audit = effectServerMiddleware('effect.registry-audit', () =>
      Effect.succeed({ value: undefined }),
    );
    const fn = serverFunction('effect.registry', inputSchema, {
      exposure: 'server',
    })
      .use(audit)
      .handler(({ input }) => Effect.succeed(`${input.value}:ok`));
    const server = createServer({ functions: [fn], execute: executeEffect().run });

    await expect(server.invoke('effect.registry', { value: 'Ada' })).resolves.toBe(
      'Ada:ok',
    );
  });
});
