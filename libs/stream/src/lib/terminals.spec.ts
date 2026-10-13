import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  TestBed,
  TemporalCancelledError,
  craftException,
  craftExpose,
  craftService,
  craftUse,
  driveCraftProgramAsync,
  pumpCraftProgramSync,
  ɵinjectAppSnapshotRegistry,
  subject,
  ɵInjector as Injector,
  ɵcreateEnvironmentInjector as createEnvironmentInjector,
  ɵrunInInjectionContext as runInInjectionContext,
  type CraftException,
  type CraftGenExceptionMarker,
  type CraftProgramPumpOptions,
  type CraftProgramStep,
} from '@craft-ts/core';
import {
  catchTag,
  fail,
  firstValueFrom,
  fromSubscribable,
  lastValueFrom,
  map,
  of,
  runForEach,
  streamSignal,
  subscribe,
  toArray,
  type CraftStream,
} from '../index';

type Boom = CraftException<{ _tag: 'Boom'; scope: undefined }, { why: string }>;
type Bang = CraftException<
  { _tag: 'Bang'; scope: undefined },
  { code: number }
>;

const boom = () => craftException({ _tag: 'Boom' as const }, { why: 'x' });

const options: CraftProgramPumpOptions = {
  invalidYieldErrorMessage: 'invalid yield in test program',
};

/** Drives a program the way a primitive loader does: sync pump, then async across awaits. */
async function run(
  program: Generator<unknown, unknown, unknown>,
  injector: Injector,
  abortSignal?: AbortSignal,
) {
  const pumpOptions = { ...options, abortSignal };
  const first = runInInjectionContext(injector, () =>
    pumpCraftProgramSync(program, injector, pumpOptions),
  );
  return driveCraftProgramAsync(program, injector, first, pumpOptions);
}

function sync(
  program: Generator<unknown, unknown, unknown>,
  injector: Injector,
): CraftProgramStep {
  return runInInjectionContext(injector, () =>
    pumpCraftProgramSync(program, injector, options),
  );
}

describe('program terminals', () => {
  it('resolve in place, without suspending, when the stream settles synchronously', () => {
    const injector = TestBed.inject(Injector);

    expect(sync(lastValueFrom(of(1, 2, 3)), injector)).toEqual({
      kind: 'done',
      value: 3,
    });
    expect(sync(firstValueFrom(of(1, 2, 3)), injector)).toEqual({
      kind: 'done',
      value: 1,
    });
    expect(sync(toArray(of(1, 2, 3)), injector)).toEqual({
      kind: 'done',
      value: [1, 2, 3],
    });
  });

  it('works through craftUse in a synchronous host', () => {
    TestBed.runInInjectionContext(() => {
      expect(craftUse(lastValueFrom(of('a', 'b')))).toBe('b');
    });
  });

  it('runForEach runs the effect per value', () => {
    const injector = TestBed.inject(Injector);
    const seen: number[] = [];

    expect(
      sync(
        runForEach(of(1, 2), (n) => seen.push(n)),
        injector,
      ),
    ).toEqual({
      kind: 'done',
      value: undefined,
    });
    expect(seen).toEqual([1, 2]);
  });

  it('an empty stream is a defect unless a default is given', () => {
    const injector = TestBed.inject(Injector);

    expect(() => sync(lastValueFrom(of()), injector)).toThrow(
      /without emitting/,
    );
    expect(
      sync(lastValueFrom(of(), { defaultValue: 'none' }), injector),
    ).toEqual({
      kind: 'done',
      value: 'none',
    });
    expect(sync(firstValueFrom(of(), { defaultValue: 0 }), injector)).toEqual({
      kind: 'done',
      value: 0,
    });
  });

  it('turn a typed exception into the program short-circuit', () => {
    const injector = TestBed.inject(Injector);
    const step = sync(lastValueFrom(fail(boom())), injector);

    expect(step.kind).toBe('shortCircuit');
    expect(step.kind === 'shortCircuit' && step.exception._tag).toBe('Boom');
  });

  it('rethrow a defect', () => {
    const injector = TestBed.inject(Injector);
    const failure = new Error('defect');

    expect(() =>
      sync(
        lastValueFrom(
          of(1).pipe(
            map(() => {
              throw failure;
            }),
          ),
        ),
        injector,
      ),
    ).toThrow(failure);
  });

  it('exceptions caught upstream never reach the program', () => {
    const injector = TestBed.inject(Injector);
    const step = sync(
      lastValueFrom(fail(boom()).pipe(catchTag('Boom', () => 'recovered'))),
      injector,
    );

    expect(step).toEqual({ kind: 'done', value: 'recovered' });
  });

  it('suspend on a promise when the stream settles later, and resume with its value', async () => {
    const injector = TestBed.inject(Injector);
    const live = subject<number>();
    const program = lastValueFrom(fromSubscribable(live));

    const pending = run(program, injector);
    live.next(1);
    live.next(2);
    live.complete();

    await expect(pending).resolves.toEqual({ kind: 'done', value: 2 });
  });

  it('surface a late exception as a short-circuit', async () => {
    const injector = TestBed.inject(Injector);
    const live = subject<number, Boom>();
    const pending = run(lastValueFrom(fromSubscribable(live)), injector);
    live.exception(boom());

    const settled = await pending;
    expect(settled.kind).toBe('shortCircuit');
  });

  it('cancel the subscription when the program is aborted (the `cancel` hook)', async () => {
    const injector = TestBed.inject(Injector);
    const unsubscribed = vi.fn();
    const live = subject<number>();
    const source = fromSubscribable({
      subscribe: (observer: Parameters<typeof live.subscribe>[0]) => {
        const subscription = live.subscribe(observer);
        return {
          unsubscribe() {
            unsubscribed();
            subscription.unsubscribe();
          },
        };
      },
    });
    const controller = new AbortController();
    const pending = run(lastValueFrom(source), injector, controller.signal);
    expect(unsubscribed).not.toHaveBeenCalled();

    controller.abort();

    await expect(pending).rejects.toBeInstanceOf(TemporalCancelledError);
    expect(unsubscribed).toHaveBeenCalledOnce();
  });

  it('cancel the subscription when the injector is destroyed (the backstop)', async () => {
    const injector = createEnvironmentInjector([], TestBed.inject(Injector));
    const unsubscribed = vi.fn();
    const source = fromSubscribable({
      subscribe: () => ({ unsubscribe: unsubscribed }),
    });
    const pending = run(lastValueFrom(source), injector);
    injector.destroy();

    await expect(pending).rejects.toBeInstanceOf(TemporalCancelledError);
    expect(unsubscribed).toHaveBeenCalledOnce();
  });

  it('resolve the injector from the driver for handlers inside the stream', () => {
    const { Offset } = craftService(
      { name: 'Offset', providedIn: 'global' },
      function* () {
        yield* craftExpose('by', 100);
      },
    );
    const injector = TestBed.inject(Injector);
    const program = lastValueFrom(
      of(1, 2).pipe(
        map(function* (n) {
          const { by } = yield* Offset();
          return n + by;
        }),
      ),
    );

    expect(sync(program, injector)).toEqual({ kind: 'done', value: 102 });
  });

  it('are composable with .pipe operators of a craft program', () => {
    const injector = TestBed.inject(Injector);
    const program = lastValueFrom(fail(boom())).pipe((p) => p);

    expect(sync(program, injector).kind).toBe('shortCircuit');
  });
});

describe('subscribe terminal', () => {
  it('requires a handler for every exception at compile time', () => {
    const stream = fail(boom()) as CraftStream<
      number,
      CraftGenExceptionMarker<Boom | Bang>
    >;

    // @ts-expect-error `exception` is required when the stream may raise
    subscribe(stream, { next: () => undefined });
    // @ts-expect-error `Bang` has no handler
    subscribe(stream, { exception: { Boom: () => undefined } });
    subscribe(stream, {
      exception: {
        Boom: (e) => {
          expectTypeOf(e).toEqualTypeOf<Boom>();
        },
        Bang: () => undefined,
      },
    });
    subscribe(stream, {
      exception: (e) => {
        expectTypeOf(e).toEqualTypeOf<Boom | Bang>();
      },
    });
  });

  it('does not require `exception` for a stream that cannot raise', () => {
    const values: number[] = [];
    subscribe(of(1, 2), { next: (n) => values.push(n) });

    expect(values).toEqual([1, 2]);
  });

  it('names the missing services when an injector is required', () => {
    const { Dep } = craftService(
      { name: 'Dep', providedIn: 'global' },
      function* () {
        yield* craftExpose('n', 1);
      },
    );
    const withDep = of(1).pipe(
      map(function* (n) {
        const { n: extra } = yield* Dep();
        return n + extra;
      }),
    );

    // @ts-expect-error a service-dependent stream needs { injector }
    subscribe(withDep, {});
    const values: number[] = [];
    subscribe(
      withDep,
      { next: (n) => values.push(n) },
      { injector: TestBed.inject(Injector) },
    );

    expect(values).toEqual([2]);
  });
});

describe('streamSignal', () => {
  it('exposes value, status and the typed exception as signals', () => {
    TestBed.runInInjectionContext(() => {
      const live = subject<number, Boom>();
      const ref = craftUse(streamSignal('numbers', fromSubscribable(live)));

      expect(ref.status()).toBe('running');
      live.next(1);
      expect(ref.value()).toBe(1);

      live.exception(boom());
      expect(ref.status()).toBe('exception');
      expect(ref.exception()?._tag).toBe('Boom');
      expectTypeOf(ref.exception()).toEqualTypeOf<Boom | undefined>();
    });
  });

  it('reports completion and defects distinctly', () => {
    TestBed.runInInjectionContext(() => {
      const done = craftUse(streamSignal('done', of(1, 2)));
      expect(done.status()).toBe('completed');
      expect(done.value()).toBe(2);

      const live = subject<number>();
      const broken = craftUse(streamSignal('broken', fromSubscribable(live)));
      const failure = new Error('defect');
      live.error(failure);

      expect(broken.status()).toBe('error');
      expect(broken.error()).toBe(failure);
      expect(broken.exception()).toBeUndefined();
    });
  });

  it('can start manually, restart, and stop', () => {
    TestBed.runInInjectionContext(() => {
      let runs = 0;
      const ref = craftUse(
        streamSignal(
          'manual',
          of(1).pipe(
            map((n) => {
              runs += 1;
              return n;
            }),
          ),
          { autoStart: false },
        ),
      );

      expect(ref.status()).toBe('idle');
      expect(runs).toBe(0);
      ref.start();
      expect(runs).toBe(1);
      ref.start();
      expect(runs).toBe(2);
      ref.stop();
      expect(ref.status()).toBe('idle');
    });
  });

  it('stops the stream when its owner is destroyed', () => {
    const injector = createEnvironmentInjector([], TestBed.inject(Injector));
    const live = subject<number>();
    const unsubscribed = vi.fn();
    const source = fromSubscribable({
      subscribe: (observer: Parameters<typeof live.subscribe>[0]) => {
        const subscription = live.subscribe(observer);
        return {
          unsubscribe() {
            unsubscribed();
            subscription.unsubscribe();
          },
        };
      },
    });
    runInInjectionContext(injector, () => {
      craftUse(streamSignal('owned', source));
    });
    injector.destroy();

    expect(unsubscribed).toHaveBeenCalledOnce();
  });

  it('shows up in app snapshots, like source$', () => {
    TestBed.runInInjectionContext(() => {
      const registry = ɵinjectAppSnapshotRegistry();
      expect(registry).not.toBeNull();
      const live = subject<number>();
      craftUse(streamSignal('tracked', fromSubscribable(live)));
      live.next(5);

      const entry = registry
        ?.snapshot()
        .find((snapshot) => snapshot.source === 'tracked');
      expect(entry?.state).toMatchObject({ status: 'running', value: 5 });
    });
  });

  it('is exposed by a craftService under its name', () => {
    const live = subject<string>();
    const { Feed } = craftService(
      { name: 'Feed', providedIn: 'global' },
      function* () {
        yield* streamSignal('latest', fromSubscribable(live));
      },
    );

    TestBed.runInInjectionContext(() => {
      const feed = craftUse(Feed());
      live.next('hello');

      expect(feed.latest.value()).toBe('hello');
    });
  });
});
