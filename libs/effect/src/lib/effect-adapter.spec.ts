import {
  craftUse,
  createCraftInjector,
  executeGeneratorCompatibleFactoryAsync,
  state,
  TestBed,
} from '@craft-ts/core';
import { Context, Data, Effect, Layer } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  asyncProcessEffect,
  computedEffect,
  effectLoader,
  mutationEffect,
  queryEffect,
} from './effect-adapter';
import { CraftEffectInterrupted, installCraftEffectBridge } from './run-effect';
import { provideLayer } from './effect-level';

class InvalidRequest extends Data.TaggedError('InvalidRequest')<{
  readonly reason: string;
}> {}

class ComputedConfig extends Context.Service<
  ComputedConfig,
  { readonly label: string }
>()('ComputedConfig') {}

const ComputedConfigLive = Layer.succeed(ComputedConfig, {
  label: 'from-layer',
});

describe('Effect-aware Craft adapters', () => {
  let dispose: () => void;

  beforeEach(() => {
    TestBed.resetTestingModule();
    dispose = installCraftEffectBridge();
  });

  afterEach(() => {
    dispose();
    TestBed.resetTestingModule();
  });

  it('rejects Effect-valued methods at compile time', async () => {
    await TestBed.runInInjectionContext(async () => {
      // @ts-expect-error Effect values belong in loaders, never in methods.
      mutationEffect('effect-method-is-not-a-loader', {
        method: (id: string) => Effect.succeed(id),
        loader: ({ params }) => Effect.succeed({ id: params }),
      });
      // @ts-expect-error Effect values belong in loaders, never in params.
      queryEffect('effect-params-is-not-a-loader', {
        params: () => Effect.succeed('id'),
        loader: ({ params }) => Effect.succeed({ id: params }),
      });
    });
  });

  it('converts the shared loader callback to a Craft generator', async () => {
    const load = effectLoader(({ params }: { params: string }) =>
      Effect.succeed(params.length),
    );
    const result = await executeGeneratorCompatibleFactoryAsync({
      factory: () => load({ params: 'Ada' } as never),
      thisArg: undefined,
      getInjector: () => createCraftInjector([]),
      args: [],
      invalidYieldErrorMessage: 'invalid yield',
    });

    expect(result).toEqual({ kind: 'done', value: 3 });
  });

  it('maps Effect.fail, Effect.die, and interruption through the existing bridge', async () => {
    const fail = effectLoader(() =>
      Effect.fail(new InvalidRequest({ reason: 'bad input' })),
    );
    const failed = await executeGeneratorCompatibleFactoryAsync({
      factory: () => fail({} as never),
      thisArg: undefined,
      getInjector: () => createCraftInjector([]),
      args: [],
      invalidYieldErrorMessage: 'invalid yield',
    });
    expect(failed.kind).toBe('shortCircuit');

    const die = effectLoader(() => Effect.die(new Error('broken')));
    await expect(
      executeGeneratorCompatibleFactoryAsync({
        factory: () => die({} as never),
        thisArg: undefined,
        getInjector: () => createCraftInjector([]),
        args: [],
        invalidYieldErrorMessage: 'invalid yield',
      }),
    ).rejects.toThrow('broken');

    const controller = new AbortController();
    const interrupted = effectLoader(() => Effect.sleep('5 seconds'));
    const pending = executeGeneratorCompatibleFactoryAsync({
      factory: () => interrupted({} as never),
      thisArg: undefined,
      getInjector: () => createCraftInjector([]),
      args: [],
      invalidYieldErrorMessage: 'invalid yield',
      abortSignal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(CraftEffectInterrupted);
  });

  it('adapts queryEffect, mutationEffect, and asyncProcessEffect', async () => {
    await TestBed.runInInjectionContext(async () => {
      const users = craftUse(
        queryEffect('users', {
          params: () => 'u-1',
          loader: ({ params }) => Effect.succeed({ id: params }),
        }),
      );
      const save = craftUse(
        mutationEffect('save', {
          method: (id: string) => id,
          loader: ({ params }) => Effect.succeed({ id: params, saved: true }),
        }),
      );
      const refresh = craftUse(
        asyncProcessEffect('refresh', {
          method: (id: string) => id,
          loader: ({ params }) => Effect.succeed({ id: params }),
        }),
      );
      await expect.poll(() => craftUse(users.value())).toEqual({ id: 'u-1' });
      save.mutate('u-2');
      refresh.method('u-3');
      await expect
        .poll(() => craftUse(save.value()))
        .toEqual({
          id: 'u-2',
          saved: true,
        });
      await expect.poll(() => craftUse(refresh.value())).toEqual({ id: 'u-3' });
    });
  });

  it('keeps params and methods synchronous', async () => {
    await TestBed.runInInjectionContext(async () => {
      const request = craftUse(
        state('effect-params-input', 'u-1', ({ set }) => ({
          setValue: set,
        })),
      );
      const paramsQuery = craftUse(
        queryEffect('effect-params-query', {
          params: function* () {
            const id = yield* request();
            return id;
          },
          loader: ({ params }) => Effect.succeed({ id: params }),
        }),
      );
      const methodQuery = craftUse(
        queryEffect('effect-method-query', {
          method: (id: string) => id,
          loader: ({ params }) => Effect.succeed({ id: params }),
        }),
      );

      await expect
        .poll(() => craftUse(paramsQuery.value()))
        .toEqual({ id: 'u-1' });
      request.setValue('u-3');
      await expect
        .poll(() => craftUse(paramsQuery.value()))
        .toEqual({ id: 'u-3' });
      methodQuery.call('u-2');
      await expect
        .poll(() => craftUse(methodQuery.value()))
        .toEqual({ id: 'u-2' });
    });
  });

  it('reactively runs computedEffect factories against the active Effect layer', async () => {
    await TestBed.runInInjectionContext(async () => {
      const input = craftUse(
        state('computed-effect-input', 'Ada', ({ set }) => ({
          setValue: set,
        })),
      );
      const value = craftUse(
        computedEffect('computed-effect-value', function* () {
          const name = yield* input();
          return Effect.succeed({ name });
        }),
      );

      await expect.poll(() => craftUse(value.value())).toEqual({ name: 'Ada' });

      input.setValue('Grace');

      await expect
        .poll(() => craftUse(value.value()))
        .toEqual({ name: 'Grace' });
    });
  });

  it('maps computedEffect failures to typed Craft exceptions', async () => {
    await TestBed.runInInjectionContext(async () => {
      const value = craftUse(
        computedEffect('computed-effect-failure', () =>
          Effect.fail(new InvalidRequest({ reason: 'invalid input' })),
        ),
      );

      await expect.poll(() => craftUse(value.hasException())).toBe(true);
      expect(craftUse(value.exception())).toMatchObject({
        _tag: 'InvalidRequest',
        payload: { reason: 'invalid input' },
      });
    });
  });

  it('runs computedEffect Effects with services from the nearest Layer', async () => {
    const injector = TestBed.rootInjector.createChild([
      provideLayer(ComputedConfigLive),
    ]);

    await injector.run(async () => {
      const value = craftUse(
        computedEffect('computed-effect-layer', () =>
          Effect.gen(function* () {
            const config = yield* ComputedConfig;
            return config.label;
          }),
        ),
      );

      await expect.poll(() => craftUse(value.value())).toBe('from-layer');
    });

    injector.destroy();
  });

  it('supports primitive computed values', async () => {
    await TestBed.runInInjectionContext(async () => {
      const value = craftUse(
        computedEffect('computed-effect-primitive', () =>
          Effect.succeed('ready'),
        ),
      );

      await expect.poll(() => craftUse(value.value())).toBe('ready');
    });
  });
});
