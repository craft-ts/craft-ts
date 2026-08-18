import {
  craftUse,
  createCraftInjector,
  executeGeneratorCompatibleFactoryAsync,
  TestBed,
} from '@craft-ts/core';
import { Data, Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { asyncProcessEffect, effectLoader, mutationEffect, queryEffect } from './effect-adapter';
import { CraftEffectInterrupted, installCraftEffectBridge } from './run-effect';

class InvalidRequest extends Data.TaggedError('InvalidRequest')<{
  readonly reason: string;
}> {}

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
      await expect.poll(() => craftUse(save.value())).toEqual({
        id: 'u-2',
        saved: true,
      });
      await expect.poll(() => craftUse(refresh.value())).toEqual({ id: 'u-3' });
    });
  });
});
