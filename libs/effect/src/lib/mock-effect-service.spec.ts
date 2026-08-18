// Task 3.2 — per-member mocking.
import {
  createCraftInjector,
  executeGeneratorCompatibleFactoryAsync,
} from '@craft-ts/core';
import { Context, Data, Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { effectService } from './effect-service';
import { mockEffectService } from './mock-effect-service';
import { installCraftEffectBridge } from './run-effect';

class NotFound extends Data.TaggedError('NotFound')<{ readonly id: string }> {}

type UserApiShape = {
  readonly byId: (id: string) => Effect.Effect<{ name: string }, NotFound>;
  readonly count: () => Effect.Effect<number>;
  readonly purge: () => Effect.Effect<void>;
};

class UserApi extends Context.Service<UserApi, UserApiShape>()('UserApi') {}

describe('mockEffectService', () => {
  let dispose: () => void;

  beforeEach(() => {
    dispose = installCraftEffectBridge();
  });
  afterEach(() => dispose());

  const driveWith = (provider: unknown, factory: () => unknown) => {
    const injector = createCraftInjector([provider] as never);
    return executeGeneratorCompatibleFactoryAsync({
      factory,
      thisArg: undefined,
      getInjector: () => injector,
      args: [],
      invalidYieldErrorMessage: 'invalid yield',
    });
  };

  it('serves the stubbed member', async () => {
    const step = await driveWith(
      mockEffectService(UserApi, {
        byId: () => Effect.succeed({ name: 'Ada' }),
      }),
      function* () {
        const { byId } = yield* effectService(UserApi, ({ byId }) => ({ byId }));
        return (yield* byId('u-1')).name;
      },
    );

    expect(step).toEqual({ kind: 'done', value: 'Ada' });
  });

  it('lets a stub fail into the exception channel like the real thing', async () => {
    const step = await driveWith(
      mockEffectService(UserApi, {
        byId: (id) => Effect.fail(new NotFound({ id })),
      }),
      function* () {
        const { byId } = yield* effectService(UserApi, ({ byId }) => ({ byId }));
        yield* byId('nope');
        return 'unreachable';
      },
    );

    expect(step.kind).toBe('shortCircuit');
    if (step.kind !== 'shortCircuit') throw new Error('expected shortCircuit');
    expect(step.exception._tag).toBe('NotFound');
  });

  it('fails loudly when a test touches an unstubbed member', async () => {
    // The point of the whole file: an unstubbed member must not read as
    // undefined, it must say which member the test forgot.
    await expect(
      driveWith(
        mockEffectService(UserApi, {
          byId: () => Effect.succeed({ name: 'Ada' }),
        }),
        function* () {
          const { purge } = yield* effectService(UserApi, ({ purge }) => ({
            purge,
          }));
          yield* purge();
          return 'unreachable';
        },
      ),
    ).rejects.toThrow(/UserApi\.purge\(\) was called but not stubbed/);
  });

  it('does not require stubbing members the test never touches', async () => {
    const step = await driveWith(
      mockEffectService(UserApi, { count: () => Effect.succeed(7) }),
      function* () {
        const { count } = yield* effectService(UserApi, ({ count }) => ({
          count,
        }));
        return yield* count();
      },
    );

    expect(step).toEqual({ kind: 'done', value: 7 });
  });
});
