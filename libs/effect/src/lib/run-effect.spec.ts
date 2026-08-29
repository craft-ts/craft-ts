// Tasks 2.3 to 2.6 — the bridge, the channel mapping, and interruption.
import {
  createCraftInjector,
  executeGeneratorCompatibleFactoryAsync,
  type AnyCraftException,
} from '@craft-ts/core';
import { Context, Data, Effect, Layer } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideLayer } from './effect-level';
import { CraftEffectInterrupted, installCraftEffectBridge } from './run-effect';

class UserNotFound extends Data.TaggedError('UserNotFound')<{
  readonly userId: string;
}> {}

class ConfigTag extends Context.Service<ConfigTag, { readonly url: string }>()(
  'Config',
) {}

const configLayer = Layer.sync(ConfigTag)(() => ({
  url: 'https://example.test',
}));

describe('installCraftEffectBridge', () => {
  let dispose: () => void;

  beforeEach(() => {
    dispose = installCraftEffectBridge();
  });

  afterEach(() => {
    dispose();
  });

  const drive = (
    factory: () => unknown,
    options: { providers?: readonly unknown[]; abortSignal?: AbortSignal } = {},
  ) => {
    const injector = createCraftInjector((options.providers ?? []) as never);
    return executeGeneratorCompatibleFactoryAsync({
      factory,
      thisArg: undefined,
      getInjector: () => injector,
      args: [],
      invalidYieldErrorMessage: 'invalid yield',
      abortSignal: options.abortSignal,
    });
  };

  describe('2.4 — channel mapping', () => {
    it('resumes the generator with the success value', async () => {
      const step = await drive(function* () {
        const name = yield* Effect.succeed('Ada');
        return `hello ${name}`;
      });

      expect(step).toEqual({ kind: 'done', value: 'hello Ada' });
    });

    it('maps a typed failure onto the exception channel, keeping its _tag', async () => {
      const step = await drive(function* () {
        return yield* Effect.fail(new UserNotFound({ userId: 'u-1' }));
        return 'unreachable';
      });

      expect(step.kind).toBe('shortCircuit');
      if (step.kind !== 'shortCircuit')
        throw new Error('expected shortCircuit');
      const exception = step.exception as AnyCraftException;
      expect(exception._tag).toBe('UserNotFound');
      expect((exception.payload as UserNotFound).userId).toBe('u-1');
    });

    it('keeps a defect on the error channel, never as an exception', async () => {
      await expect(
        drive(function* () {
          return yield* Effect.die(new Error('kaboom'));
          return 'unreachable';
        }),
      ).rejects.toThrow('kaboom');
    });

    it('short-circuits at the first failure and skips the rest', async () => {
      const after = vi.fn();

      const step = await drive(function* () {
        return yield* Effect.fail(new UserNotFound({ userId: 'u-2' }));
        after();
        return 'unreachable';
      });

      expect(step.kind).toBe('shortCircuit');
      expect(after).not.toHaveBeenCalled();
    });
  });

  describe('2.5 — requirements', () => {
    it('satisfies R from the level in force', async () => {
      const step = await drive(
        function* () {
          const config = yield* ConfigTag;
          return config.url;
        },
        { providers: [provideLayer(configLayer)] },
      );

      expect(step).toEqual({ kind: 'done', value: 'https://example.test' });
    });

    it('fails at runtime when no level provides the requirement', async () => {
      // The type-level guard is assertNoRequirements, checked in
      // requirements.spec.ts; this is the runtime backstop.
      await expect(
        drive(function* () {
          const config = yield* ConfigTag;
          return config.url;
        }),
      ).rejects.toBeDefined();
    });
  });

  describe('2.6 — interruption', () => {
    it('surfaces cancellation as CraftEffectInterrupted, not as an exception', async () => {
      const controller = new AbortController();

      const promise = drive(
        function* () {
          yield* Effect.sleep('5 seconds');
          return 'unreachable';
        },
        { abortSignal: controller.signal },
      );

      controller.abort();

      // Asserted precisely: an earlier version of this test allowed craft's own
      // TemporalCancelledError too, and would have passed even if the bridge
      // never ran. It is CraftEffectInterrupted that must surface.
      await expect(promise).rejects.toBeInstanceOf(CraftEffectInterrupted);
    });

    it('does not leak the interrupted work into the exception channel', async () => {
      const controller = new AbortController();
      const after = vi.fn();

      const promise = drive(
        function* () {
          yield* Effect.sleep('5 seconds');
          after();
          return 'unreachable';
        },
        { abortSignal: controller.signal },
      );
      controller.abort();

      await promise.catch(() => undefined);
      expect(after).not.toHaveBeenCalled();
    });
  });

  it('2.3 — leaves yields it does not recognise to the usual error', async () => {
    await expect(
      drive(function* () {
        yield { not: 'an effect' };
        return 'unreachable';
      }),
    ).rejects.toThrow('invalid yield');
  });
});
