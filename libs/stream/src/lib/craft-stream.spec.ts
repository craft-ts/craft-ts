import { Observable, from } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import {
  TestBed,
  behaviorSubject,
  craftException,
  ɵcreateEnvironmentInjector as createEnvironmentInjector,
  ɵInjector as Injector,
  ɵrunInInjectionContext as runInInjectionContext,
  craftExpose,
  craftService,
  craftSleep,
  replaySubject,
  subject,
  type CraftException,
} from '@craft-ts/core';
import {
  catchTag,
  distinctUntilChanged,
  empty,
  fail,
  filter,
  fromSubscribable,
  map,
  mapException,
  of,
  orElse,
  scan,
  share,
  shareReplay,
  skip,
  startWith,
  subscribe,
  take,
  takeUntil,
  takeUntilDestroyed,
  takeWhile,
  tap,
  toSubscribable,
  type CraftStream,
} from '../index';

type Boom = CraftException<{ _tag: 'Boom'; scope: undefined }, { why: string }>;
type Bang = CraftException<
  { _tag: 'Bang'; scope: undefined },
  { code: number }
>;

const boom = (why = 'boom') =>
  craftException({ _tag: 'Boom' as const }, { why });
const bang = (code = 1) => craftException({ _tag: 'Bang' as const }, { code });

type Recorded<A> = {
  values: A[];
  exceptions: unknown[];
  errors: unknown[];
  completed: number;
  unsubscribe(): void;
};

function record<A, Y>(stream: CraftStream<A, Y>): Recorded<A> {
  const recorded: Recorded<A> = {
    values: [],
    exceptions: [],
    errors: [],
    completed: 0,
    unsubscribe: () => undefined,
  };
  const subscription = stream.subscribe({
    next: (value) => recorded.values.push(value),
    exception: (exception) => recorded.exceptions.push(exception),
    error: (error) => recorded.errors.push(error),
    complete: () => {
      recorded.completed += 1;
    },
  });
  recorded.unsubscribe = () => subscription.unsubscribe();
  return recorded;
}

describe('sources', () => {
  it('of emits in order then completes; empty completes at once', () => {
    const a = record(of(1, 2, 3));
    const b = record(empty());

    expect(a.values).toEqual([1, 2, 3]);
    expect(a.completed).toBe(1);
    expect(b.values).toEqual([]);
    expect(b.completed).toBe(1);
  });

  it('is cold: every subscription re-runs the source', () => {
    const run = vi.fn();
    const stream = of(1).pipe(tap(run));
    record(stream);
    record(stream);

    expect(run).toHaveBeenCalledTimes(2);
  });

  it('fail terminates with the typed exception', () => {
    const result = record(fail(boom()));

    expect(result.exceptions).toHaveLength(1);
    expect(result.completed).toBe(0);
  });

  it('wraps a core subject and forwards its typed exception', () => {
    const source = subject<number, Boom>();
    const result = record(fromSubscribable(source));
    source.next(1);
    source.exception(boom());

    expect(result.values).toEqual([1]);
    expect(result.exceptions).toHaveLength(1);
  });

  it('wraps an rxjs Observable; its error is a defect', () => {
    const failure = new Error('rx');
    const result = record(
      fromSubscribable(
        new Observable<number>((subscriber) => {
          subscriber.next(1);
          subscriber.error(failure);
        }),
      ),
    );

    expect(result.values).toEqual([1]);
    expect(result.errors).toEqual([failure]);
    expect(result.exceptions).toEqual([]);
  });

  it('exposes a stream to rxjs through toSubscribable', () => {
    const values: number[] = [];
    const exposed = toSubscribable(of(1, 2).pipe(map((n) => n * 10)));
    // A Subscribable is the structural contract; rxjs wraps it in an Observable.
    from(
      new Observable<number>((subscriber) => exposed.subscribe(subscriber)),
    ).subscribe((v) => values.push(v));

    expect(values).toEqual([10, 20]);
  });

  it('routes a typed exception to `error` for a subscriber without `exception`', () => {
    const errors: unknown[] = [];
    fail(boom()).subscribe({ error: (e) => errors.push(e) });

    expect(errors).toHaveLength(1);
  });
});

describe('per-value operators', () => {
  it('map / filter / scan / tap compose', () => {
    const seen: number[] = [];
    const result = record(
      of(1, 2, 3, 4).pipe(
        map((n) => n * 2),
        filter((n) => n > 2),
        tap((n) => seen.push(n)),
        scan((acc, n) => acc + n, 0),
      ),
    );

    expect(seen).toEqual([4, 6, 8]);
    expect(result.values).toEqual([4, 10, 18]);
    expect(result.completed).toBe(1);
  });

  it('passes the index to the projection', () => {
    const result = record(of('a', 'b').pipe(map((v, i) => `${i}${v}`)));

    expect(result.values).toEqual(['0a', '1b']);
  });

  it('turns a throwing handler into a defect, not an exception', () => {
    const failure = new Error('handler');
    const result = record(
      of(1).pipe(
        map(() => {
          throw failure;
        }),
      ),
    );

    expect(result.errors).toEqual([failure]);
    expect(result.exceptions).toEqual([]);
  });

  it('lets a generator handler return an exception, which enters the exception channel', () => {
    const result = record(
      of(1, 2).pipe(
        map(function* (n) {
          return n === 2 ? boom() : n;
        }),
      ),
    );

    expect(result.values).toEqual([1]);
    expect(result.exceptions).toHaveLength(1);
  });

  it('resolves a service yielded by a generator handler', () => {
    const { Multiplier } = craftService(
      { name: 'Multiplier', providedIn: 'global' },
      function* () {
        yield* craftExpose('factor', 3);
      },
    );

    TestBed.runInInjectionContext(() => {
      const result = record(
        of(1, 2).pipe(
          map(function* (n) {
            const { factor } = yield* Multiplier();
            return n * factor;
          }),
        ),
      );

      expect(result.errors).toEqual([]);
      expect(result.values).toEqual([3, 6]);
    });
  });

  it('fails clearly when a handler needs a service but there is no injector', () => {
    const { Needy } = craftService(
      { name: 'Needy', providedIn: 'global' },
      function* () {
        yield* craftExpose('ok', true);
      },
    );

    const result = record(
      of(1).pipe(
        map(function* (n) {
          yield* Needy();
          return n;
        }),
      ),
    );

    expect(result.errors).toHaveLength(1);
    expect(String(result.errors[0])).toMatch(/injector/i);
  });

  it('keeps order across a suspended handler and defers completion until it settles', async () => {
    vi.useFakeTimers();
    try {
      const events: string[] = [];
      TestBed.runInInjectionContext(() => {
        of(1, 2, 3)
          .pipe(
            map(function* (n) {
              if (n === 1) yield* craftSleep(50);
              return n;
            }),
          )
          .subscribe({
            next: (v) => events.push(`n${v}`),
            complete: () => events.push('done'),
          });
      });

      expect(events).toEqual([]);
      await vi.advanceTimersByTimeAsync(60);
      expect(events).toEqual(['n1', 'n2', 'n3', 'done']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops a suspended handler on unsubscribe', async () => {
    vi.useFakeTimers();
    try {
      const values: number[] = [];
      let subscription: { unsubscribe(): void } | undefined;
      TestBed.runInInjectionContext(() => {
        subscription = of(1)
          .pipe(
            map(function* (n) {
              yield* craftSleep(50);
              return n;
            }),
          )
          .subscribe({ next: (v) => values.push(v) });
      });
      subscription?.unsubscribe();
      await vi.advanceTimersByTimeAsync(100);

      expect(values).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('limiting operators', () => {
  it('take completes early and unsubscribes upstream', () => {
    const source = subject<number>();
    const result = record(fromSubscribable(source).pipe(take(2)));
    source.next(1);
    source.next(2);
    source.next(3);

    expect(result.values).toEqual([1, 2]);
    expect(result.completed).toBe(1);
  });

  it('take(0) completes without subscribing', () => {
    const subscribeSpy = vi.fn();
    const result = record(
      fromSubscribable({
        subscribe: (observer) => {
          subscribeSpy();
          void observer;
          return { unsubscribe: () => undefined };
        },
      }).pipe(take(0)),
    );

    expect(result.completed).toBe(1);
    expect(subscribeSpy).not.toHaveBeenCalled();
  });

  it('take releases a synchronous source mid-flight', () => {
    const emitted: number[] = [];
    const result = record(
      of(1, 2, 3, 4).pipe(
        tap((n) => emitted.push(n)),
        take(2),
      ),
    );

    expect(result.values).toEqual([1, 2]);
    expect(emitted).toEqual([1, 2]);
  });

  it('skip, takeWhile, distinctUntilChanged, startWith', () => {
    expect(record(of(1, 2, 3).pipe(skip(1))).values).toEqual([2, 3]);
    expect(record(of(1, 2, 3, 1).pipe(takeWhile((n) => n < 3))).values).toEqual(
      [1, 2],
    );
    expect(
      record(of(1, 2, 3).pipe(takeWhile((n) => n < 3, { inclusive: true })))
        .values,
    ).toEqual([1, 2, 3]);
    expect(
      record(of(1, 1, 2, 2, 1).pipe(distinctUntilChanged())).values,
    ).toEqual([1, 2, 1]);
    expect(
      record(
        of('a', 'A', 'b').pipe(
          distinctUntilChanged((a, b) => a.toLowerCase() === b.toLowerCase()),
        ),
      ).values,
    ).toEqual(['a', 'b']);
    expect(record(of(3).pipe(startWith(1, 2))).values).toEqual([1, 2, 3]);
  });

  it('takeUntil completes when the notifier emits, and not before', () => {
    const source = subject<number>();
    const stop = subject<void>();
    const result = record(
      fromSubscribable(source).pipe(takeUntil(fromSubscribable(stop))),
    );
    source.next(1);
    stop.next();
    source.next(2);

    expect(result.values).toEqual([1]);
    expect(result.completed).toBe(1);
  });

  it('takeUntil with a notifier that fires synchronously never starts the source', () => {
    const subscribeSpy = vi.fn();
    const source = fromSubscribable<number>({
      subscribe: () => {
        subscribeSpy();
        return { unsubscribe: () => undefined };
      },
    });
    const result = record(source.pipe(takeUntil(of(true))));

    expect(result.completed).toBe(1);
    expect(subscribeSpy).not.toHaveBeenCalled();
  });

  it('takeUntil forwards an exception of its notifier', () => {
    const result = record(
      fromSubscribable(subject<number>()).pipe(takeUntil(fail(boom()))),
    );

    expect(result.exceptions).toHaveLength(1);
  });

  it('takeUntilDestroyed completes when the destroy ref fires', () => {
    const source = subject<number>();
    const injector = createEnvironmentInjector([], Injector.NULL);
    const result = record(
      runInInjectionContext(injector, () =>
        fromSubscribable(source).pipe(takeUntilDestroyed()),
      ),
    );
    source.next(1);
    injector.destroy();
    source.next(2);

    expect(result.values).toEqual([1]);
    expect(result.completed).toBe(1);
  });

  it('takeUntilDestroyed errors rather than never ending when there is no DestroyRef', () => {
    const result = record(
      fromSubscribable(subject<number>()).pipe(takeUntilDestroyed()),
    );

    expect(result.errors).toHaveLength(1);
    expect(String(result.errors[0])).toMatch(/DestroyRef/);
  });
});

describe('exception operators', () => {
  it('catchTag replaces the exception with the handler result, then completes', () => {
    const result = record(
      of(1).pipe(
        map(function* () {
          return boom('x');
        }),
        catchTag('Boom', (e) => `caught:${(e as Boom).payload.why}`),
      ),
    );

    expect(result.values).toEqual(['caught:x']);
    expect(result.completed).toBe(1);
    expect(result.exceptions).toEqual([]);
  });

  it('catchTag lets other tags through and leaves defects alone', () => {
    const failure = new Error('defect');
    const other = record(
      fail(bang()).pipe(catchTag('Boom' as never, () => 'nope' as never)),
    );
    const defect = record(
      of(1).pipe(
        map(() => {
          throw failure;
        }),
        catchTag('Boom' as never, () => 'nope' as never),
      ),
    );

    expect(other.exceptions).toHaveLength(1);
    expect(other.values).toEqual([]);
    expect(defect.errors).toEqual([failure]);
  });

  it('catchTag accepts a generator handler', () => {
    const result = record(
      fail(boom()).pipe(
        catchTag('Boom', function* () {
          return 42;
        }),
      ),
    );

    expect(result.values).toEqual([42]);
  });

  it('catchTag handler returning an exception re-enters the exception channel', () => {
    const result = record(fail(boom()).pipe(catchTag('Boom', () => bang())));

    expect(result.values).toEqual([]);
    expect(result.exceptions).toHaveLength(1);
    expect((result.exceptions[0] as Bang)._tag).toBe('Bang');
  });

  it('catchTag.exhaustive dispatches by tag', () => {
    const ofTag = (exception: Boom | Bang): CraftStream<never, never> =>
      fail(exception) as never;
    const handlers = catchTag.exhaustive({
      Boom: () => 'b',
      Bang: () => 'g',
    } as never) as unknown as (
      stream: CraftStream<never, never>,
    ) => CraftStream<string, never>;

    expect(record(handlers(ofTag(boom()))).values).toEqual(['b']);
    expect(record(handlers(ofTag(bang()))).values).toEqual(['g']);
  });

  it('mapException rewrites the exception', () => {
    const result = record(fail(boom()).pipe(mapException(() => bang(7))));

    expect((result.exceptions[0] as Bang).payload.code).toBe(7);
  });

  it('orElse continues with the fallback stream', () => {
    const result = record(fail(boom()).pipe(orElse(() => of('a', 'b'))));

    expect(result.values).toEqual(['a', 'b']);
    expect(result.completed).toBe(1);
  });
});

describe('multicast', () => {
  it('share connects once for several subscribers and disconnects at zero', () => {
    const connects = vi.fn();
    const disconnects = vi.fn();
    const live = subject<number>();
    const source = fromSubscribable({
      subscribe: (observer: Parameters<typeof live.subscribe>[0]) => {
        connects();
        const subscription = live.subscribe(observer);
        return {
          unsubscribe() {
            disconnects();
            subscription.unsubscribe();
          },
        };
      },
    }).pipe(share());

    const a = record(source);
    const b = record(source);
    live.next(1);
    a.unsubscribe();
    expect(disconnects).not.toHaveBeenCalled();
    b.unsubscribe();

    expect(connects).toHaveBeenCalledTimes(1);
    expect(disconnects).toHaveBeenCalledTimes(1);
    expect(a.values).toEqual([1]);
    expect(b.values).toEqual([1]);
  });

  it('share starts a fresh run after a terminal', () => {
    const runs = vi.fn();
    const source = of(1).pipe(tap(runs), share());
    record(source);
    record(source);

    expect(runs).toHaveBeenCalledTimes(2);
  });

  it('shareReplay replays to late subscribers and keeps the terminal', () => {
    const runs = vi.fn();
    TestBed.runInInjectionContext(() => {
      const source = of(1, 2, 3).pipe(tap(runs), shareReplay(2));
      record(source);
      const late = record(source);

      expect(runs).toHaveBeenCalledTimes(3);
      expect(late.values).toEqual([2, 3]);
      expect(late.completed).toBe(1);
    });
  });

  it('shareReplay forwards a typed exception to late subscribers', () => {
    TestBed.runInInjectionContext(() => {
      const source = fail(boom()).pipe(shareReplay(1));
      record(source);
      const late = record(source);

      expect(late.exceptions).toHaveLength(1);
    });
  });

  it('shareReplay refuses to keep a connection nobody can release', () => {
    expect(() => of(1).pipe(shareReplay(1))).toThrow(/needs an owner/);
    expect(() =>
      of(1).pipe(shareReplay(1, { resetOnRefCountZero: true })),
    ).not.toThrow();
  });

  it('shareReplay releases its connection when the owner is destroyed', () => {
    const injector = createEnvironmentInjector([], Injector.NULL);
    const unsubscribed = vi.fn();
    const source = fromSubscribable<number>({
      subscribe: () => ({ unsubscribe: unsubscribed }),
    });
    const shared = runInInjectionContext(injector, () =>
      source.pipe(shareReplay(1)),
    );
    record(shared);
    injector.destroy();

    expect(unsubscribed).toHaveBeenCalledOnce();
  });

  it('interops with core subjects as sources', () => {
    const replayed = replaySubject<number>(1);
    replayed.next(7);
    const held = behaviorSubject(1);

    expect(record(fromSubscribable(replayed)).values).toEqual([7]);
    expect(record(fromSubscribable(held)).values).toEqual([1]);
  });
});

describe('subscribe terminal', () => {
  it('dispatches exceptions to a function or to a per-tag map', () => {
    const viaFunction = vi.fn();
    const viaMap = vi.fn();
    const stream = fail(boom()) as CraftStream<
      never,
      import('@craft-ts/core').CraftGenExceptionMarker<Boom>
    >;
    subscribe(stream, { exception: viaFunction });
    subscribe(stream, { exception: { Boom: viaMap } });

    expect(viaFunction).toHaveBeenCalledOnce();
    expect(viaMap).toHaveBeenCalledOnce();
  });

  it('sends an exception with no matching handler to `error`', () => {
    const error = vi.fn();
    subscribe(of(1) as never, { error } as never);
    const stream = fail(boom()) as never;
    subscribe(stream, { exception: {}, error } as never);

    expect(error).toHaveBeenCalledOnce();
  });
});
