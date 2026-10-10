import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TestBed,
  VirtualCraftTemporalRuntime,
  activateCraftTemporalRuntime,
  craftException,
  craftSleep,
  craftUse,
  driveCraftProgramAsync,
  pumpCraftProgramSync,
  subject,
  ɵInjector as Injector,
  ɵrunInInjectionContext as runInInjectionContext,
  type Subject,
} from '@craft-ts/core';
import {
  buffer,
  bufferTime,
  bufferWhen,
  catchTag,
  expand,
  fail,
  firstValueFrom,
  fromSubscribable,
  mapException,
  map,
  of,
  orElse,
  runForEach,
  streamSignal,
  subscribe,
  toArray,
  type AnyCraftStream,
  type CraftStream,
} from '../index';

const boom = () => craftException({ _tag: 'Boom' as const }, { why: 'x' });

let clock: VirtualCraftTemporalRuntime;
let restoreClock: () => void;
beforeEach(() => {
  clock = new VirtualCraftTemporalRuntime();
  restoreClock = activateCraftTemporalRuntime(clock);
});
afterEach(() => restoreClock());

function observe(stream: AnyCraftStream) {
  const seen = {
    values: [] as unknown[],
    exceptions: [] as unknown[],
    errors: [] as unknown[],
    completed: 0,
  };
  const subscription = stream.subscribe({
    next: (value: unknown) => seen.values.push(value),
    exception: (e: unknown) => seen.exceptions.push(e),
    error: (e: unknown) => seen.errors.push(e),
    complete: () => {
      seen.completed += 1;
    },
  });
  return { seen, subscription };
}

describe('mapException', () => {
  it('rewrites the exception it receives', () => {
    const { seen } = observe(
      fail(boom()).pipe(
        mapException(() => craftException({ _tag: 'Other' as const }, {})),
      ) as AnyCraftStream,
    );

    expect((seen.exceptions[0] as { _tag: string })._tag).toBe('Other');
  });

  it('a mapper that throws is a defect', () => {
    const failure = new Error('mapper');
    const { seen } = observe(
      fail(boom()).pipe(
        mapException(() => {
          throw failure;
        }),
      ) as AnyCraftStream,
    );

    expect(seen.errors).toEqual([failure]);
    expect(seen.exceptions).toEqual([]);
  });
});

describe('orElse', () => {
  it('continues with the fallback stream', () => {
    const { seen } = observe(
      fail(boom()).pipe(orElse(() => of('fallback'))) as AnyCraftStream,
    );

    expect(seen.values).toEqual(['fallback']);
    expect(seen.completed).toBe(1);
  });

  it('a fallback that throws is a defect', () => {
    const failure = new Error('fallback');
    const { seen } = observe(
      fail(boom()).pipe(
        orElse(() => {
          throw failure;
        }),
      ) as AnyCraftStream,
    );

    expect(seen.errors).toEqual([failure]);
  });

  it('a fallback that is not a craft stream is a defect, not a hang', () => {
    const { seen } = observe(
      fail(boom()).pipe(orElse(() => 'nope' as never)) as AnyCraftStream,
    );

    expect(seen.errors).toHaveLength(1);
    expect(String(seen.errors[0])).toMatch(/must return a craft stream/);
  });

  it('releases the fallback when unsubscribed', () => {
    const live = subject<number, never>();
    const unsubscribed = vi.fn();
    const fallback = fromSubscribable({
      subscribe: (observer: Parameters<typeof live.subscribe>[0]) => {
        const inner = live.subscribe(observer);
        return {
          unsubscribe() {
            unsubscribed();
            inner.unsubscribe();
          },
        };
      },
    }) as CraftStream<number, never>;

    const { subscription } = observe(
      fail(boom()).pipe(orElse(() => fallback)) as AnyCraftStream,
    );
    subscription.unsubscribe();

    expect(unsubscribed).toHaveBeenCalledOnce();
  });
});

describe('catchTag handlers', () => {
  it('a handler may answer with another typed exception', () => {
    const { seen } = observe(
      fail(boom()).pipe(
        catchTag('Boom', () => craftException({ _tag: 'Next' as const }, {})),
      ) as AnyCraftStream,
    );

    expect((seen.exceptions[0] as { _tag: string })._tag).toBe('Next');
  });

  it('a handler that throws is a defect', () => {
    const failure = new Error('handler');
    const { seen } = observe(
      fail(boom()).pipe(
        catchTag('Boom', () => {
          throw failure;
        }),
      ) as AnyCraftStream,
    );

    expect(seen.errors).toEqual([failure]);
  });

  it('an asynchronous handler is cancelled by unsubscribing', async () => {
    const reached = vi.fn();
    const { seen, subscription } = observe(
      fail(boom()).pipe(
        catchTag('Boom', function* () {
          yield* craftSleep(50);
          reached();
          return 'late';
        }),
      ) as AnyCraftStream,
    );

    subscription.unsubscribe();
    await clock.advanceBy(100);

    expect(reached).not.toHaveBeenCalled();
    expect(seen.values).toEqual([]);
  });

  it('an asynchronous handler delivers its value when left alone', async () => {
    const { seen } = observe(
      fail(boom()).pipe(
        catchTag('Boom', function* () {
          yield* craftSleep(50);
          return 'late';
        }),
      ) as AnyCraftStream,
    );

    await clock.advanceBy(100);

    expect(seen.values).toEqual(['late']);
    expect(seen.completed).toBe(1);
  });
});

describe('program terminals on failure', () => {
  const pump = (program: Generator<unknown, unknown, unknown>) => {
    const injector = TestBed.inject(Injector);
    return runInInjectionContext(injector, () =>
      pumpCraftProgramSync(program, injector, {
        invalidYieldErrorMessage: 'invalid',
      }),
    );
  };

  it('toArray and runForEach surface a typed exception as a short-circuit', () => {
    expect(pump(toArray(fail(boom()))).kind).toBe('shortCircuit');
    expect(pump(runForEach(fail(boom()), () => undefined)).kind).toBe(
      'shortCircuit',
    );
  });

  it('toArray and firstValueFrom rethrow a defect', () => {
    const failure = new Error('defect');
    const broken = of(1).pipe(
      map(() => {
        throw failure;
      }),
    );

    expect(() => pump(toArray(broken))).toThrow(failure);
    expect(() => pump(firstValueFrom(broken))).toThrow(failure);
  });

  it('runForEach: an effect that throws ends the program with that defect', () => {
    const failure = new Error('effect');

    expect(() =>
      pump(
        runForEach(of(1), () => {
          throw failure;
        }),
      ),
    ).toThrow(failure);
  });

  it('firstValueFrom of an empty stream is a defect, or the default', () => {
    expect(() => pump(firstValueFrom(of()))).toThrow(/without emitting/);
    expect(pump(firstValueFrom(of(), { defaultValue: 'd' }))).toEqual({
      kind: 'done',
      value: 'd',
    });
  });

  it('a late failure reaches the program after it suspended', async () => {
    const injector = TestBed.inject(Injector);
    const live = subject<number, never>();
    const program = toArray(fromSubscribable(live));
    const first = runInInjectionContext(injector, () =>
      pumpCraftProgramSync(program, injector, {
        invalidYieldErrorMessage: 'x',
      }),
    );
    const settled = driveCraftProgramAsync(program, injector, first, {
      invalidYieldErrorMessage: 'x',
    });
    (live as Subject<number, unknown>).error(new Error('late'));

    await expect(settled).rejects.toThrow('late');
  });
});

describe('subscribe without a handler for an exception', () => {
  it('falls back to the defect callback', () => {
    const errors: unknown[] = [];
    TestBed.runInInjectionContext(() => {
      subscribe(
        fail(boom()) as AnyCraftStream as never,
        {
          error: (error: unknown) => errors.push(error),
        } as never,
      );
    });

    expect(errors).toHaveLength(1);
  });
});

describe('streamSignal states', () => {
  it('reports a typed exception and a defect as distinct states', () => {
    TestBed.runInInjectionContext(() => {
      const withException = craftUse(streamSignal('typed', fail(boom())));
      expect(withException.status()).toBe('exception');
      expect((withException.exception() as { _tag: string })._tag).toBe('Boom');

      const withDefect = craftUse(
        streamSignal(
          'defect',
          of(1).pipe(
            map(() => {
              throw new Error('defect');
            }),
          ),
        ),
      );
      expect(withDefect.status()).toBe('error');
      expect(String(withDefect.error())).toContain('defect');
    });
  });

  it('a restart supersedes the previous run, which can no longer write', () => {
    TestBed.runInInjectionContext(() => {
      const first = subject<number, never>();
      const ref = craftUse(
        streamSignal('restart', fromSubscribable(first), { autoStart: false }),
      );

      ref.start();
      first.next(1);
      expect(ref.value()).toBe(1);

      ref.start();
      expect(ref.value()).toBeUndefined();
      first.next(2);
      expect(ref.value()).toBe(2);

      ref.stop();
      first.next(3);
      expect(ref.value()).toBe(2);
      expect(ref.status()).toBe('idle');
    });
  });
});

describe('buffering and expand misuse is a defect, never a hang', () => {
  it('buffer / bufferWhen reject a closing value that is not a craft stream', () => {
    const viaBuffer = observe(
      of(1).pipe(buffer('nope' as never)) as AnyCraftStream,
    );
    const viaWhen = observe(
      of(1).pipe(bufferWhen(() => 'nope' as never)) as AnyCraftStream,
    );

    expect(String(viaBuffer.seen.errors[0])).toMatch(/must be a craft stream/);
    expect(String(viaWhen.seen.errors[0])).toMatch(
      /must return a craft stream/,
    );
  });

  it('bufferTime flushes the remainder on completion and stops its timer', async () => {
    const live = subject<number, never>();
    const { seen } = observe(
      fromSubscribable(live).pipe(bufferTime(100)) as AnyCraftStream,
    );

    live.next(1);
    live.next(2);
    live.complete();
    await clock.advanceBy(500);

    expect(seen.values).toEqual([[1, 2]]);
    expect(seen.completed).toBe(1);
  });

  it('expand: a projection that throws, answers an exception, or returns a non-stream', () => {
    const failure = new Error('projection');
    const threw = observe(
      of(1).pipe(
        expand(() => {
          throw failure;
        }),
      ) as AnyCraftStream,
    );
    const excepted = observe(
      of(1).pipe(expand(() => boom() as never)) as AnyCraftStream,
    );
    const wrong = observe(
      of(1).pipe(expand(() => 'nope' as never)) as AnyCraftStream,
    );

    expect(threw.seen.errors).toEqual([failure]);
    expect(excepted.seen.exceptions).toHaveLength(1);
    expect(String(wrong.seen.errors[0])).toMatch(/must return a stream/);
  });

  it('expand: follows a plain Subscribable returned by the projection', () => {
    // A bare Subscribable, not a craft stream: emits n + 1, then completes.
    const next = (n: number) => ({
      subscribe(observer: { next?(v: number): void; complete?(): void }) {
        observer.next?.(n + 1);
        observer.complete?.();
        return { unsubscribe() {} };
      },
    });
    const { seen } = observe(
      of(1).pipe(
        expand((n: number) => (n < 3 ? next(n) : of())),
      ) as AnyCraftStream,
    );

    expect(seen.values).toEqual([1, 2, 3]);
    expect(seen.completed).toBe(1);
  });
});
