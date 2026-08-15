// @vitest-environment jsdom
import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import { asyncProcess } from './async-process';
import { craftException, isCraftException } from './craft-exception';
import {
  craftGen,
  CraftGenShortCircuit,
  isCraftGenShortCircuit,
} from './craft-gen';
import { isGuardAwaitRequest } from './craft-generator-runtime';
import { catchTag } from './craft-program-operators';
import { craftUse } from './craft-use';
import {
  craftLazy,
  CRAFT_LAZY_LOAD_ERROR_CODE,
  type CraftLazyLoadError,
} from './craft-lazy';
import {
  provideCraftLazyLoadRetry,
  type CraftLazyLoadHelpers,
} from './craft-load-retry';
import { craftUntilSettled } from './craft-until-settled';

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(
        'Cannot set base providers because it has already been called',
      )
    ) {
      throw error;
    }
  }
});

// Reads the promise an `await`-request suspends on so a hand-driven test can
// resolve it itself and feed the value back — no async pump needed.
function awaitedPromise(value: unknown): Promise<unknown> {
  expect(isGuardAwaitRequest(value)).toBe(true);
  return Promise.resolve(
    (value as { kind: 'promise'; value: PromiseLike<unknown> }).value,
  );
}

// Exercises the generator protocol directly, outside an injection context (so
// the retry helpers degrade to a single attempt). This avoids the async pump and
// the `toObservable` settle path entirely.
describe('craftLazy (generator protocol)', () => {
  it('yields a promise await-request, then returns the loaded module', async () => {
    const moduleValue = { search: 'FN' as const };
    const program = craftLazy(() =>
      Promise.resolve(moduleValue),
    ) as unknown as Generator<unknown, unknown, unknown>;

    const first = program.next();
    expect(first.done).toBe(false);
    const resolved = await awaitedPromise(first.value);
    expect(resolved).toBe(moduleValue);

    const done = program.next(resolved);
    expect(done.done).toBe(true);
    expect(done.value).toBe(moduleValue);
  });

  it('converts a final import failure into a CRAFT_LAZY_LOAD_ERROR short-circuit', async () => {
    const cause = new Error('boom');
    const program = craftLazy(() =>
      Promise.reject<{ never: true }>(cause),
    ) as unknown as Generator<unknown, unknown, unknown>;

    const resolved = await awaitedPromise(program.next().value);
    expect(isCraftException(resolved)).toBe(true);
    expect((resolved as CraftLazyLoadError).code).toBe(
      CRAFT_LAZY_LOAD_ERROR_CODE,
    );
    expect((resolved as CraftLazyLoadError).payload.cause).toBe(cause);

    try {
      program.next(resolved);
      expect.unreachable('expected a CraftGenShortCircuit to be thrown');
    } catch (error) {
      expect(isCraftGenShortCircuit(error)).toBe(true);
      expect((error as CraftGenShortCircuit).exception.code).toBe(
        CRAFT_LAZY_LOAD_ERROR_CODE,
      );
    }
  });
});

// Drives craftLazy through the real async program pump inside an `asyncProcess`
// loader, with the injection context providing the retry engine.
describe('craftLazy (inside an asyncProcess)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
  });

  it('resolves to the lazily-loaded module', async () => {
    await TestBed.runInInjectionContext(async () => {
      const moduleValue = { greet: () => 'hi' };
      const ref = craftUse(
        asyncProcess('ref', {
          method: (v: string) => v,
          loader: function* () {
            return yield* craftLazy(({ withRetry }) =>
              withRetry(Promise.resolve(moduleValue)),
            );
          },
        }),
      );

      ref.method('go');
      expect(craftUse(ref.status())).toBe('loading');
      await vi.runAllTimersAsync();

      expect(craftUse(ref.status())).toBe('resolved');
      expect(craftUse(ref.value())).toBe(moduleValue);
      expect(craftUse(ref.hasException())).toBe(false);
    });
  });

  it('surfaces an exhausted import as a CRAFT_LAZY_LOAD_ERROR exception', async () => {
    TestBed.configureTestingModule({
      providers: [provideCraftLazyLoadRetry({ attempts: 1, delayMs: 0 })],
    });

    await TestBed.runInInjectionContext(async () => {
      const load = vi.fn(({ withRetry }: CraftLazyLoadHelpers) =>
        withRetry(Promise.reject<{ never: true }>(new Error('offline'))),
      );
      const ref = craftUse(
        asyncProcess('ref', {
          method: (v: string) => v,
          loader: function* () {
            return yield* craftLazy(load);
          },
        }),
      );

      ref.method('go');
      await vi.runAllTimersAsync();

      // Initial attempt + one retry.
      expect(load).toHaveBeenCalledTimes(2);
      expect(craftUse(ref.status())).toBe('exception');
      expect(craftUse(ref.hasException())).toBe(true);
      expect(craftUse(ref.exception())?.code).toBe(CRAFT_LAZY_LOAD_ERROR_CODE);
      expect(
        craftUse(ref.exceptions()).loader?.[CRAFT_LAZY_LOAD_ERROR_CODE],
      ).toMatchObject({
        cause: expect.any(Error),
      });
      expect(craftUse(ref.value())).toBeUndefined();
    });
  });

  it('retries a failing import up to the configured attempts, then resolves', async () => {
    TestBed.configureTestingModule({
      providers: [provideCraftLazyLoadRetry({ attempts: 2, delayMs: 0 })],
    });

    await TestBed.runInInjectionContext(async () => {
      let calls = 0;
      const ref = craftUse(
        asyncProcess('ref', {
          method: (v: string) => v,
          loader: function* () {
            return yield* craftLazy(({ withRetry }) =>
              withRetry(
                calls++ < 2
                  ? Promise.reject<{ ok: true }>(new Error('nope'))
                  : Promise.resolve({ ok: true } as const),
              ),
            );
          },
        }),
      );

      ref.method('go');
      await vi.runAllTimersAsync();

      // Initial attempt (fails), then two retries — the second succeeds.
      expect(calls).toBe(3);
      expect(craftUse(ref.status())).toBe('resolved');
      expect(craftUse(ref.value())).toEqual({ ok: true });
    });
  });

  it('recovers from a failed lazy import through .pipe(catchTag(...))', async () => {
    TestBed.configureTestingModule({
      providers: [provideCraftLazyLoadRetry({ attempts: 1, delayMs: 0 })],
    });

    await TestBed.runInInjectionContext(async () => {
      const ref = craftUse(
        asyncProcess('ref', {
          method: (v: string) => v,
          loader: function* () {
            return yield* craftLazy<{ ok: boolean }>(({ withRetry }) =>
              withRetry(Promise.reject(new Error('offline'))),
            ).pipe(
              catchTag(CRAFT_LAZY_LOAD_ERROR_CODE, function* () {
                return { ok: false };
              }),
            );
          },
        }),
      );

      ref.method('go');
      await vi.runAllTimersAsync();

      // The lazy-load failure was caught: the resource resolves to the fallback.
      expect(craftUse(ref.status())).toBe('resolved');
      expect(craftUse(ref.value())).toEqual({ ok: false });
      expect(craftUse(ref.hasException())).toBe(false);
    });
  });
});

// Type-level checks: `craftLazy` must not degrade the module type to
// `unknown`/`any`, and the chained propagation (`craftUntilSettled` of a lazy
// process → calling the loaded generator) must carry both the lazy-load error
// and the module's own business exceptions into the consuming resource.
describe('craftLazy (type propagation)', () => {
  it('preserves the module type and propagates every exception code', () => {
    // Typechecked but never executed (no injection context at runtime).
    function _typeOnly() {
      const search = craftGen(function* (q: string) {
        if (q === 'a') return craftException({ code: 'E1' }, { q });
        if (q === 'b') return craftException({ code: 'E2' }, { q });
        return [q];
      });

      const loaded = craftLazy(() => Promise.resolve({ search }));
      const drive = function* () {
        // `craftLazy` resolves to the module value untouched (T preserved).
        const mod = yield* loaded;
        expectTypeOf(mod).toEqualTypeOf<{ search: typeof search }>();
        return mod;
      };

      const searchProcess = craftUse(
        asyncProcess('searchProcess', {
          method: (v: string) => v,
          loader: drive,
        }),
      );

      const searchResult = craftUse(
        asyncProcess('searchResult', {
          method: (q: string) => q,
          loader: function* ({ params }) {
            const { search: loadedSearch } =
              yield* craftUntilSettled(searchProcess);
            return yield* loadedSearch(params);
          },
        }),
      );

      // The success value survives the whole chain.
      expectTypeOf(craftUse(searchResult.value())).toEqualTypeOf<
        string[] | undefined
      >();

      // Both the lazy-load failure and `search`'s business exceptions surface.
      type ResultCodes = NonNullable<
        ReturnType<typeof searchResult.exception>
      >['code'];
      expectTypeOf<ResultCodes>().toEqualTypeOf<
        'E1' | 'E2' | typeof CRAFT_LAZY_LOAD_ERROR_CODE
      >();

      return { searchProcess, searchResult };
    }

    expect(typeof _typeOnly).toBe('function');
  });

  it('removes a caught code from the propagated exception union', () => {
    // Typechecked but never executed.
    function _typeOnly() {
      // Catch the only exception (`CRAFT_LAZY_LOAD_ERROR`) at the source: the
      // resource's exception union becomes empty, so `exception()` is `undefined`.
      const recovered = craftUse(
        asyncProcess('recovered', {
          method: (v: string) => v,
          loader: function* () {
            return yield* craftLazy<{ ok: boolean }>(({ withRetry }) =>
              withRetry(Promise.resolve({ ok: true })),
            ).pipe(
              catchTag(CRAFT_LAZY_LOAD_ERROR_CODE, function* () {
                return { ok: false };
              }),
            );
          },
        }),
      );

      expectTypeOf(craftUse(recovered.exception())).toEqualTypeOf<undefined>();
      expectTypeOf(craftUse(recovered.value())).toEqualTypeOf<
        { ok: boolean } | undefined
      >();

      return recovered;
    }

    expect(typeof _typeOnly).toBe('function');
  });
});
