// ---------------------------------------------------------------------------
// ɵ WAVE-0 EFFECT PROTOTYPE — THROWAWAY (plan task 0.1).
//
// Question this spec answers: does the `_tag` of an Effect error travel all the
// way to `user.exception()`, reusing the pump's existing `'promise'` await path?
// ---------------------------------------------------------------------------

import { Data, Effect } from 'effect';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import type { AnyCraftException } from './craft-exception';
import { craftUse } from './craft-use';
import { installEffectYieldBridge } from './effect-yield-bridge.fixture';
import { executeGeneratorCompatibleFactoryAsync } from './craft-program-runtime';
import { query } from './query';
import { setupCraftServiceTest } from './setup-craft-service-test';

class UserNotFound extends Data.TaggedError('UserNotFound')<{
  readonly userId: string;
}> {}

class Unauthorized extends Data.TaggedError('Unauthorized')<{
  readonly reason: string;
}> {}

const runInInjectionContext = <T>(fn: () => T): T =>
  setupCraftServiceTest().injector.run(fn);

describe('wave-0 prototype: yield* Effect in the craft pump', () => {
  let disposeBridge: () => void;

  beforeEach(() => {
    disposeBridge = installEffectYieldBridge();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    disposeBridge();
  });

  describe('driver level', () => {
    const drive = (factory: () => unknown) =>
      runInInjectionContext(() =>
        executeGeneratorCompatibleFactoryAsync({
          factory,
          thisArg: undefined,
          getInjector: () => setupCraftServiceTest().injector,
          args: [],
          invalidYieldErrorMessage: 'invalid yield',
        }),
      );

    it('resumes the generator with the Effect success value', async () => {
      const step = await drive(function* () {
        const name = yield* Effect.succeed('Ada');
        const upper = yield* Effect.sync(() => (name as string).toUpperCase());
        return `hello ${upper}`;
      });

      expect(step).toEqual({ kind: 'done', value: 'hello ADA' });
    });

    it('turns a typed Effect failure into a short-circuit carrying its _tag', async () => {
      const step = await drive(function* () {
        yield* Effect.fail(new UserNotFound({ userId: 'u-1' }));
        return 'unreachable';
      });

      expect(step.kind).toBe('shortCircuit');
      if (step.kind !== 'shortCircuit') throw new Error('expected shortCircuit');
      expect(step.exception.code).toBe('UserNotFound');
      expect(step.exception.payload).toBeInstanceOf(UserNotFound);
      expect((step.exception.payload as UserNotFound).userId).toBe('u-1');
    });

    it('short-circuits at the first failing Effect and skips the rest', async () => {
      const after = vi.fn();

      const step = await drive(function* () {
        yield* Effect.fail(new Unauthorized({ reason: 'no token' }));
        after();
        return 'unreachable';
      });

      expect(step.kind).toBe('shortCircuit');
      expect(after).not.toHaveBeenCalled();
    });

    it('falls back to the invalid-yield error when no bridge is installed', async () => {
      disposeBridge();

      await expect(
        drive(function* () {
          yield* Effect.succeed('Ada');
          return 'unreachable';
        }),
      ).rejects.toThrow('invalid yield');

      disposeBridge = installEffectYieldBridge();
    });

    it('keeps a defect on the error channel, never as an exception', async () => {
      await expect(
        drive(function* () {
          yield* Effect.die(new Error('kaboom'));
          return 'unreachable';
        }),
      ).rejects.toThrow('kaboom');
    });
  });

  describe('end to end through query()', () => {
    it('surfaces the Effect error _tag on queryRef.exception()', async () => {
      await runInInjectionContext(async () => {
        const queryRef = craftUse(
          query('user', {
            params: () => 'u-42',
            loader: function* ({ params }) {
              const user = yield* Effect.fail(
                new UserNotFound({ userId: params as string }),
              );
              return user as { id: string };
            },
          }),
        );

        await vi.runAllTimersAsync();

        expect(craftUse(queryRef.status())).toBe('exception');
        expect(craftUse(queryRef.hasException())).toBe(true);

        // FINDING (0.1-b) — the runtime is right, the types are not. `E` does
        // not flow from the yielded Effect into the query's exception union: the
        // channel is statically `undefined` (an exception is not even
        // representable) while one is provably sitting in it at runtime.
        // Closing this is the whole of task 2.4/2.5; the cast below is what a
        // user would have to write today.
        expectTypeOf(craftUse(queryRef.exception())).toEqualTypeOf<undefined>();

        const raised = craftUse(
          queryRef.exception(),
        ) as unknown as AnyCraftException;
        expect(raised.code).toBe('UserNotFound');
        expect((raised.payload as UserNotFound).userId).toBe('u-42');
        expect(craftUse(queryRef.value())).toBeUndefined();
      });
    });

    it('loads normally when the Effect succeeds', async () => {
      await runInInjectionContext(async () => {
        const queryRef = craftUse(
          query('user', {
            params: () => 'u-7',
            loader: function* ({ params }) {
              const id = yield* Effect.succeed(params as string);
              return { id };
            },
          }),
        );

        await vi.runAllTimersAsync();

        expect(craftUse(queryRef.status())).toBe('resolved');
        expect(craftUse(queryRef.value())).toEqual({ id: 'u-7' });
        expect(craftUse(queryRef.exception())).toBeUndefined();
      });
    });
  });
});
