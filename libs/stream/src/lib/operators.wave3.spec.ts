import { Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TestBed,
  VirtualCraftTemporalRuntime,
  activateCraftTemporalRuntime,
  craftException,
  craftExpose,
  craftService,
  subject,
  type Subject,
} from '@craft-ts/core';
import {
  StreamBufferOverflowError,
  buffer,
  bufferCount,
  bufferTime,
  combineLatest,
  concatMap,
  debounce,
  delay,
  empty,
  exhaustMap,
  fail,
  fromSubscribable,
  groupBy,
  map,
  merge,
  mergeMap,
  of,
  pairwise,
  race,
  repeat,
  retry,
  sample,
  switchMap,
  take,
  tap,
  throttle,
  timeout,
  window,
  withLatestFrom,
  zip,
  type CraftStream,
  type StreamTimeoutException,
} from '../index';

const boom = () => craftException({ _tag: 'Boom' as const }, { why: 'x' });

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

/** A hot input driven by hand. */
function hot<A, E = never>() {
  const source = subject<A, E>();
  return {
    source,
    stream: fromSubscribable(source as Subject<A, never>) as CraftStream<
      A,
      never
    >,
  };
}

let clock: VirtualCraftTemporalRuntime;
let restoreClock: () => void;

beforeEach(() => {
  clock = new VirtualCraftTemporalRuntime();
  restoreClock = activateCraftTemporalRuntime(clock);
});

afterEach(() => {
  restoreClock();
});

describe('switchMap', () => {
  it('cancels the running inner stream when a new value arrives', () => {
    const inners = [hot<string>(), hot<string>()];
    const outer = hot<number>();
    const result = record(
      outer.stream.pipe(switchMap((n) => inners[n].stream)),
    );

    outer.source.next(0);
    inners[0].source.next('a0');
    outer.source.next(1);
    inners[0].source.next('lost');
    inners[1].source.next('b1');

    expect(result.values).toEqual(['a0', 'b1']);
  });

  it('completes only when the outer and the last inner have completed', () => {
    const inner = hot<string>();
    const outer = hot<number>();
    const result = record(outer.stream.pipe(switchMap(() => inner.stream)));
    outer.source.next(0);
    outer.source.complete();
    expect(result.completed).toBe(0);
    inner.source.complete();

    expect(result.completed).toBe(1);
  });

  it('accepts a synchronous inner stream and a plain Subscribable', () => {
    expect(
      record(of(1, 2).pipe(switchMap((n) => of(n, n * 10)))).values,
    ).toEqual([1, 10, 2, 20]);
    expect(
      record(
        of(1).pipe(
          switchMap(
            (n) =>
              new Observable<number>((subscriber) => {
                subscriber.next(n + 100);
                subscriber.complete();
              }),
          ),
        ),
      ).values,
    ).toEqual([101]);
  });

  it('resolves a service yielded by a generator projection', () => {
    const { Base } = craftService(
      { name: 'Base', providedIn: 'global' },
      function* () {
        yield* craftExpose('by', 1000);
      },
    );
    TestBed.runInInjectionContext(() => {
      const result = record(
        of(1, 2).pipe(
          switchMap(function* (n) {
            const { by } = yield* Base();
            return of(n + by);
          }),
        ),
      );

      expect(result.errors).toEqual([]);
      expect(result.values).toEqual([1001, 1002]);
    });
  });

  it('terminates with an inner exception', () => {
    const result = record(of(1).pipe(switchMap(() => fail(boom()))));

    expect(result.exceptions).toHaveLength(1);
  });

  it('reports a projection that does not return a stream as a defect', () => {
    const result = record(
      of(1).pipe(switchMap((() => 42) as unknown as () => CraftStream<number>)),
    );

    expect(result.errors).toHaveLength(1);
    expect(String(result.errors[0])).toMatch(/must return a stream/);
  });

  it('unsubscribes the inner stream when the result is unsubscribed', () => {
    const unsubscribed = vi.fn();
    const outer = hot<number>();
    const result = record(
      outer.stream.pipe(
        switchMap(
          () =>
            ({
              subscribe: () => ({ unsubscribe: unsubscribed }),
            }) as never,
        ),
      ),
    );
    outer.source.next(1);
    result.unsubscribe();

    expect(unsubscribed).toHaveBeenCalledOnce();
  });
});

describe('exhaustMap', () => {
  it('ignores outer values while an inner stream is running', () => {
    const inner = hot<string>();
    const outer = hot<number>();
    const projected = vi.fn(() => inner.stream);
    const result = record(outer.stream.pipe(exhaustMap(projected)));

    outer.source.next(1);
    outer.source.next(2);
    inner.source.next('x');
    inner.source.complete();
    outer.source.next(3);

    expect(projected).toHaveBeenCalledTimes(2);
    expect(result.values).toEqual(['x']);
  });
});

describe('concatMap', () => {
  it('runs inner streams one after the other, in order', () => {
    const inners = [hot<string>(), hot<string>()];
    const outer = hot<number>();
    const result = record(
      outer.stream.pipe(concatMap((n) => inners[n].stream)),
    );

    outer.source.next(0);
    outer.source.next(1);
    inners[1].source.next('early');
    inners[0].source.next('a');
    inners[0].source.complete();
    inners[1].source.next('b');

    expect(result.values).toEqual(['a', 'b']);
  });

  it('refuses a value that overflows the buffer with a defect by default', () => {
    const inner = hot<string>();
    const outer = hot<number>();
    const result = record(
      outer.stream.pipe(concatMap(() => inner.stream, { buffer: 1 })),
    );

    outer.source.next(1); // running
    outer.source.next(2); // queued
    outer.source.next(3); // overflow

    expect(result.errors[0]).toBeInstanceOf(StreamBufferOverflowError);
  });

  it('drops the newest or the oldest queued value on request', () => {
    const run = (overflow: 'drop-newest' | 'drop-oldest') => {
      const inners: Array<ReturnType<typeof hot<string>>> = [];
      const outer = hot<number>();
      const seen: number[] = [];
      record(
        outer.stream.pipe(
          concatMap(
            (n) => {
              seen.push(n);
              const inner = hot<string>();
              inners.push(inner);
              return inner.stream;
            },
            { buffer: 1, overflow },
          ),
        ),
      );
      outer.source.next(1);
      outer.source.next(2);
      outer.source.next(3);
      inners[0].source.complete();
      inners[1]?.source.complete();
      return seen;
    };

    expect(run('drop-newest')).toEqual([1, 2]);
    expect(run('drop-oldest')).toEqual([1, 3]);
  });
});

describe('mergeMap', () => {
  it('runs inner streams concurrently', () => {
    const inners = [hot<string>(), hot<string>()];
    const outer = hot<number>();
    const result = record(outer.stream.pipe(mergeMap((n) => inners[n].stream)));
    outer.source.next(0);
    outer.source.next(1);
    inners[1].source.next('b');
    inners[0].source.next('a');

    expect(result.values).toEqual(['b', 'a']);
  });

  it('caps concurrency and queues the rest', () => {
    const started: number[] = [];
    const inners = new Map<number, ReturnType<typeof hot<string>>>();
    const outer = hot<number>();
    record(
      outer.stream.pipe(
        mergeMap(
          (n) => {
            started.push(n);
            const inner = hot<string>();
            inners.set(n, inner);
            return inner.stream;
          },
          { concurrency: 2 },
        ),
      ),
    );
    outer.source.next(1);
    outer.source.next(2);
    outer.source.next(3);
    expect(started).toEqual([1, 2]);
    inners.get(1)?.source.complete();

    expect(started).toEqual([1, 2, 3]);
  });
});

describe('combination', () => {
  it('combineLatest emits once every input has a value, as a tuple or a record', () => {
    const a = hot<number>();
    const b = hot<string>();
    const tuple = record(combineLatest([a.stream, b.stream]));
    const named = record(combineLatest({ a: a.stream, b: b.stream }));

    a.source.next(1);
    expect(tuple.values).toEqual([]);
    b.source.next('x');
    a.source.next(2);

    expect(tuple.values).toEqual([
      [1, 'x'],
      [2, 'x'],
    ]);
    expect(named.values).toEqual([
      { a: 1, b: 'x' },
      { a: 2, b: 'x' },
    ]);
  });

  it('combineLatest completes when all complete, or when one completes empty', () => {
    const a = hot<number>();
    const b = hot<number>();
    const all = record(combineLatest([a.stream, b.stream]));
    a.source.next(1);
    b.source.next(1);
    a.source.complete();
    expect(all.completed).toBe(0);
    b.source.complete();
    expect(all.completed).toBe(1);

    expect(record(combineLatest([of(1), empty()])).completed).toBe(1);
    expect(record(combineLatest([])).completed).toBe(1);
  });

  it('combineLatest forwards an exception of any input', () => {
    expect(
      record(combineLatest([of(1), fail(boom())])).exceptions,
    ).toHaveLength(1);
  });

  it('merge interleaves and completes when all complete', () => {
    const a = hot<number>();
    const b = hot<number>();
    const result = record(merge(a.stream, b.stream));
    a.source.next(1);
    b.source.next(2);
    a.source.complete();
    expect(result.completed).toBe(0);
    b.source.complete();

    expect(result.values).toEqual([1, 2]);
    expect(result.completed).toBe(1);
  });

  it('zip pairs by position and completes when an input runs dry', () => {
    const a = hot<number>();
    const b = hot<string>();
    const result = record(zip(a.stream, b.stream));
    a.source.next(1);
    a.source.next(2);
    b.source.next('x');
    b.source.next('y');
    a.source.complete();

    expect(result.values).toEqual([
      [1, 'x'],
      [2, 'y'],
    ]);
    expect(result.completed).toBe(1);
  });

  it('race mirrors the first input to emit and drops the others', () => {
    const slow = hot<string>();
    const fast = hot<string>();
    const result = record(race(slow.stream, fast.stream));
    fast.source.next('fast');
    slow.source.next('slow');
    fast.source.next('again');

    expect(result.values).toEqual(['fast', 'again']);
  });

  it('race lets a synchronous input win without subscribing the later ones', () => {
    const later = vi.fn();
    const never = fromSubscribable<number>({
      subscribe: () => {
        later();
        return { unsubscribe: () => undefined };
      },
    });
    const result = record(race(of(1), never));

    expect(result.values).toEqual([1]);
    expect(later).not.toHaveBeenCalled();
  });

  it('withLatestFrom pairs with the latest of the other and drops earlier values', () => {
    const main = hot<number>();
    const other = hot<string>();
    const result = record(main.stream.pipe(withLatestFrom(other.stream)));
    main.source.next(1);
    other.source.next('a');
    main.source.next(2);
    other.source.next('b');
    main.source.next(3);

    expect(result.values).toEqual([
      [2, 'a'],
      [3, 'b'],
    ]);
  });
});

describe('time', () => {
  it('debounce emits the latest value after the quiet period, and flushes on completion', async () => {
    const input = hot<number>();
    const result = record(input.stream.pipe(debounce(100)));
    input.source.next(1);
    await clock.advanceBy(50);
    input.source.next(2);
    await clock.advanceBy(99);
    expect(result.values).toEqual([]);
    await clock.advanceBy(1);
    expect(result.values).toEqual([2]);

    input.source.next(3);
    input.source.complete();
    expect(result.values).toEqual([2, 3]);
    expect(result.completed).toBe(1);
  });

  it('debounce cancels its timer when unsubscribed', async () => {
    const input = hot<number>();
    const result = record(input.stream.pipe(debounce(100)));
    input.source.next(1);
    result.unsubscribe();
    await clock.advanceBy(200);

    expect(result.values).toEqual([]);
    expect(clock.pendingTasks()).toEqual([]);
  });

  it('throttle: leading by default, trailing on request', async () => {
    const lead = hot<number>();
    const leading = record(lead.stream.pipe(throttle(100)));
    lead.source.next(1);
    lead.source.next(2);
    await clock.advanceBy(100);
    lead.source.next(3);
    expect(leading.values).toEqual([1, 3]);

    const trail = hot<number>();
    const trailing = record(
      trail.stream.pipe(throttle(100, { leading: false, trailing: true })),
    );
    trail.source.next(1);
    trail.source.next(2);
    expect(trailing.values).toEqual([]);
    await clock.advanceBy(100);
    expect(trailing.values).toEqual([2]);
  });

  it('delay shifts every value and completes after the last one', async () => {
    const result = record(of(1, 2).pipe(delay(50)));
    expect(result.values).toEqual([]);
    await clock.advanceBy(50);

    expect(result.values).toEqual([1, 2]);
    expect(result.completed).toBe(1);
  });

  it('timeout raises a typed exception after a silent period', async () => {
    const input = hot<number>();
    const result = record(input.stream.pipe(timeout(100)));
    input.source.next(1);
    await clock.advanceBy(60);
    input.source.next(2);
    await clock.advanceBy(99);
    expect(result.exceptions).toEqual([]);
    await clock.advanceBy(1);

    expect(result.values).toEqual([1, 2]);
    expect((result.exceptions[0] as StreamTimeoutException)._tag).toBe(
      'StreamTimeout',
    );
  });

  it('timeout can bound only the first value', async () => {
    const input = hot<number>();
    const result = record(input.stream.pipe(timeout({ first: 100 })));
    await clock.advanceBy(50);
    input.source.next(1);
    await clock.advanceBy(10_000);

    expect(result.exceptions).toEqual([]);
  });

  it('retry resubscribes on a typed exception, then lets it through', async () => {
    let runs = 0;
    const result = record(
      of(1).pipe(
        tap(() => {
          runs += 1;
        }),
        map(function* () {
          return boom();
        }),
        retry({ times: 2 }),
      ),
    );

    expect(runs).toBe(3);
    expect(result.exceptions).toHaveLength(1);
  });

  it('retry waits between attempts and succeeds once the source does', async () => {
    let attempt = 0;
    const result = record(
      of(1).pipe(
        map(function* () {
          attempt += 1;
          return attempt < 3 ? boom() : 'ok';
        }),
        retry({ times: 3, delayMs: 100 }),
      ),
    );

    expect(attempt).toBe(1);
    await clock.advanceBy(100);
    expect(attempt).toBe(2);
    await clock.advanceBy(100);

    expect(result.values).toEqual(['ok']);
    expect(result.exceptions).toEqual([]);
  });

  it('retry honours `while` and never retries a defect', () => {
    let runs = 0;
    const filtered = record(
      fail(boom()).pipe(
        tap(() => undefined),
        retry({ times: 3, while: ['Other'] }),
      ),
    );
    const defect = record(
      of(1).pipe(
        map(() => {
          runs += 1;
          throw new Error('defect');
        }),
        retry({ times: 3 }),
      ),
    );

    expect(filtered.exceptions).toHaveLength(1);
    expect(runs).toBe(1);
    expect(defect.errors).toHaveLength(1);
  });

  it('retry stops when unsubscribed during the wait', async () => {
    let runs = 0;
    const result = record(
      of(1).pipe(
        map(function* () {
          runs += 1;
          return boom();
        }),
        retry({ times: 5, delayMs: 100 }),
      ),
    );
    result.unsubscribe();
    await clock.advanceBy(1000);

    expect(runs).toBe(1);
  });

  it('repeat resubscribes on completion, `times` more runs', () => {
    const result = record(of(1, 2).pipe(repeat({ times: 2 })));

    expect(result.values).toEqual([1, 2, 1, 2, 1, 2]);
    expect(result.completed).toBe(1);
  });

  it('repeat on a synchronous source does not overflow the stack', () => {
    const result = record(of(1).pipe(repeat(), take(50_000)));

    expect(result.values).toHaveLength(50_000);
    expect(result.completed).toBe(1);
  });

  it('repeat waits between runs', async () => {
    const result = record(of(1).pipe(repeat({ times: 2, delayMs: 100 })));
    expect(result.values).toEqual([1]);
    await clock.advanceBy(100);
    expect(result.values).toEqual([1, 1]);
    await clock.advanceBy(100);

    expect(result.values).toEqual([1, 1, 1]);
    expect(result.completed).toBe(1);
  });
});

describe('buffers', () => {
  it('buffer groups values until the notifier emits and flushes the rest', () => {
    const input = hot<number>();
    const tick = hot<void>();
    const result = record(input.stream.pipe(buffer(tick.stream)));
    input.source.next(1);
    input.source.next(2);
    tick.source.next();
    input.source.next(3);
    input.source.complete();

    expect(result.values).toEqual([[1, 2], [3]]);
    expect(result.completed).toBe(1);
  });

  it('bufferCount emits arrays of a given size', () => {
    expect(record(of(1, 2, 3, 4, 5).pipe(bufferCount(2))).values).toEqual([
      [1, 2],
      [3, 4],
      [5],
    ]);
    expect(() => bufferCount(0)).toThrow(RangeError);
  });

  it('bufferTime emits each non-empty slice', async () => {
    const input = hot<number>();
    const result = record(input.stream.pipe(bufferTime(100)));
    input.source.next(1);
    input.source.next(2);
    await clock.advanceBy(100);
    await clock.advanceBy(100);
    input.source.next(3);
    await clock.advanceBy(100);

    expect(result.values).toEqual([[1, 2], [3]]);
  });
});

describe('neighbours, sampling and inner streams', () => {
  it('pairwise emits [previous, current]', () => {
    expect(record(of(1, 2, 3).pipe(pairwise())).values).toEqual([
      [1, 2],
      [2, 3],
    ]);
  });

  it('sample emits the latest value on each tick, once', () => {
    const input = hot<number>();
    const tick = hot<void>();
    const result = record(input.stream.pipe(sample(tick.stream)));
    input.source.next(1);
    input.source.next(2);
    tick.source.next();
    tick.source.next();
    input.source.next(3);
    tick.source.next();

    expect(result.values).toEqual([2, 3]);
  });

  it('groupBy hands out one hot stream per key', () => {
    const input = hot<{ k: string; n: number }>();
    const groups: Record<string, number[]> = {};
    const completed: string[] = [];
    input.stream.pipe(groupBy((v) => v.k)).subscribe({
      next: (group) => {
        groups[group.key] = [];
        group.subscribe({
          next: (v) => groups[group.key].push(v.n),
          complete: () => completed.push(group.key),
        });
      },
    });
    input.source.next({ k: 'a', n: 1 });
    input.source.next({ k: 'b', n: 2 });
    input.source.next({ k: 'a', n: 3 });
    input.source.complete();

    expect(groups).toEqual({ a: [1, 3], b: [2] });
    expect(completed.sort()).toEqual(['a', 'b']);
  });

  it('window starts a new inner stream on each notifier emission', () => {
    const input = hot<number>();
    const open = hot<void>();
    const windows: number[][] = [];
    input.stream.pipe(window(open.stream)).subscribe({
      next: (w) => {
        const values: number[] = [];
        windows.push(values);
        w.subscribe({ next: (v) => values.push(v) });
      },
    });
    input.source.next(1);
    open.source.next();
    input.source.next(2);
    input.source.next(3);

    expect(windows).toEqual([[1], [2, 3]]);
  });
});
