// @vitest-environment jsdom
import { afterEach, expect, expectTypeOf, it, vi } from 'vitest';
import {
  asyncProcess,
  catchTag,
  craftAwait,
  craftSignal,
  craftUse,
  CraftTestBed,
  CRAFT_PROMISE_REJECTED_CODE,
  mutation,
  query,
} from '../index';

afterEach(() => CraftTestBed.resetTestingModule());

it('awaits an SDK in a query and continues with its typed result', async () => {
  const sdk = vi.fn(async (_signal: AbortSignal) => 42);
  const ref = CraftTestBed.runInInjectionContext(() =>
    craftUse(
      query('sdk', {
        params: () => 'id',
        loader: function* ({ abortSignal }) {
          const value = yield* craftAwait(() => sdk(abortSignal));
          expectTypeOf(value).toEqualTypeOf<number>();
          return value + 1;
        },
      }),
    ),
  );
  await vi.waitFor(() => expect(craftUse(ref.status())).toBe('resolved'));
  expect(craftUse(ref.value())).toBe(43);
  expect(sdk).toHaveBeenCalledTimes(1);
});

it('supports mutation and asyncProcess loaders', async () => {
  const [save, load] = CraftTestBed.runInInjectionContext(
    () =>
      [
        craftUse(
          mutation('sdkSave', {
            method: (value: number) => value,
            loader: function* ({ params }) {
              return yield* craftAwait(Promise.resolve(params + 1));
            },
          }),
        ),
        craftUse(
          asyncProcess('sdkLoad', {
            method: (value: number) => value,
            loader: function* ({ params }) {
              return {
                value: yield* craftAwait(() => Promise.resolve(params + 2)),
              };
            },
          }),
        ),
      ] as const,
  );
  craftUse(save.mutate(2));
  craftUse(load.method(3));
  await vi.waitFor(() => {
    expect(craftUse(save.value())).toBe(3);
    expect(craftUse(load.value())).toEqual({ value: 5 });
  });
});

it('exposes a rejected SDK promise through the typed exception channel', async () => {
  const cause = new Error('SDK offline');
  const ref = CraftTestBed.runInInjectionContext(() =>
    craftUse(
      query('sdkFailure', {
        params: () => true,
        loader: function* () {
          return yield* craftAwait(() => Promise.reject<number>(cause));
        },
      }),
    ),
  );
  await vi.waitFor(() => expect(craftUse(ref.status())).toBe('exception'));
  expect(craftUse(ref.exception())).toMatchObject({
    _tag: CRAFT_PROMISE_REJECTED_CODE,
    payload: { cause },
  });
  expect(craftUse(ref.exceptions()).loader?.CRAFT_PROMISE_REJECTED).toEqual({
    cause,
  });
  expect(craftUse(ref.value())).toBeUndefined();
});

it('allows catchTag to recover from synchronous SDK factory failures', async () => {
  const cause = new Error('SDK refused');
  const ref = CraftTestBed.runInInjectionContext(() =>
    craftUse(
      query('sdkRecovery', {
        params: () => true,
        loader: function* () {
          return yield* craftAwait<number>(() => {
            throw cause;
          }).pipe(
            catchTag(CRAFT_PROMISE_REJECTED_CODE, function* () {
              return 7;
            }),
          );
        },
      }),
    ),
  );
  await vi.waitFor(() => expect(craftUse(ref.value())).toBe(7));
  expect(craftUse(ref.hasException())).toBe(false);
});

it('cancels suspended producers when params change and when the owner is destroyed', async () => {
  const params = craftSignal('first');
  const signals: AbortSignal[] = [];
  const cancel = vi.fn();
  CraftTestBed.runInInjectionContext(() =>
    craftUse(
      query('sdkCancel', {
        params,
        loader: function* ({ abortSignal }) {
          return yield* craftAwait(
            () => {
              signals.push(abortSignal);
              return new Promise<number>(() => undefined);
            },
            { cancel },
          );
        },
      }),
    ),
  );
  await vi.waitFor(() => expect(signals).toHaveLength(1));
  params.set('second');
  await vi.waitFor(() => expect(signals).toHaveLength(2));
  expect(signals[0].aborted).toBe(true);
  expect(cancel).toHaveBeenCalledTimes(1);
  CraftTestBed.resetTestingModule();
  expect(signals[1].aborted).toBe(true);
  expect(cancel).toHaveBeenCalledTimes(2);
});
