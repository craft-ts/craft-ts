import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  VirtualCraftTemporalRuntime,
  activateCraftTemporalRuntime,
  craftException,
  subject,
  type Subject,
} from '@craft-ts/core';
import {
  audit,
  auditTime,
  bufferCount,
  bufferWhen,
  buffer,
  combineLatest,
  concat,
  expand,
  forkJoin,
  groupBy,
  merge,
  race,
  sample,
  skipUntil,
  takeUntil,
  window,
  windowCount,
  withLatestFrom,
  zip,
  bufferTime,
  concatMap,
  count,
  debounce,
  defaultIfEmpty,
  delay,
  distinct,
  distinctUntilChanged,
  distinctUntilKeyChanged,
  elementAt,
  endWith,
  every,
  exhaustMap,
  filter,
  finalize,
  find,
  findIndex,
  first,
  fromSubscribable,
  ignoreElements,
  isEmpty,
  last,
  map,
  mapTo,
  max,
  mergeMap,
  min,
  observeOn,
  of,
  pairwise,
  reduce,
  sampleTime,
  scan,
  share,
  shareReplay,
  single,
  skip,
  skipLast,
  skipWhile,
  startWith,
  subscribeOn,
  switchMap,
  take,
  takeLast,
  takeWhile,
  tap,
  throttle,
  throwIfEmpty,
  timeInterval,
  timer,
  timestamp,
  type AnyCraftStream,
  type CraftStream,
} from '../index';

// ---------------------------------------------------------------------------
// The operator contract. Whatever an operator does with VALUES, the same three
// things hold, and each is a way a stream library leaks or lies:
//
// 1. unsubscribing releases the source, and nothing is delivered afterwards;
// 2. a typed exception from the source ends the result with that exception,
//    once, and nothing follows it;
// 3. a defect from the source ends the result with that defect, once.
//
// The table is deliberately flat: adding an operator to the library without
// adding it here is the omission to catch in review.
// ---------------------------------------------------------------------------

type Source = {
  stream: CraftStream<number, never>;
  subject: Subject<number, never>;
  subscribed: number;
  unsubscribed: number;
};

/** A hot source that counts how often it is subscribed and released. */
function spySource(): Source {
  const live = subject<number, never>();
  const spy: Source = {
    subject: live,
    subscribed: 0,
    unsubscribed: 0,
    stream: undefined as never,
  };
  spy.stream = fromSubscribable({
    subscribe: (observer: Parameters<typeof live.subscribe>[0]) => {
      spy.subscribed += 1;
      const subscription = live.subscribe(observer);
      return {
        unsubscribe() {
          spy.unsubscribed += 1;
          subscription.unsubscribe();
        },
      };
    },
  }) as CraftStream<number, never>;
  return spy;
}

type Op = (source: CraftStream<number, never>) => AnyCraftStream;

const pipeWith =
  (...operators: Array<(stream: AnyCraftStream) => AnyCraftStream>): Op =>
  (source) =>
    operators.reduce<AnyCraftStream>(
      (stream, operator) => operator(stream),
      source,
    );

const operators: Record<string, Op> = {
  map: pipeWith(map((n: number) => n + 1) as never),
  filter: pipeWith(filter((n: number) => n > 0) as never),
  tap: pipeWith(tap(() => undefined) as never),
  scan: pipeWith(scan((total: number, n: number) => total + n, 0) as never),
  take: pipeWith(take(5) as never),
  skip: pipeWith(skip(1) as never),
  takeWhile: pipeWith(takeWhile((n: number) => n < 100) as never),
  skipWhile: pipeWith(skipWhile((n: number) => n < 0) as never),
  distinct: pipeWith(distinct() as never),
  distinctUntilChanged: pipeWith(distinctUntilChanged() as never),
  distinctUntilKeyChanged: pipeWith(
    map((n: number) => ({ n })) as never,
    distinctUntilKeyChanged<{ n: number }, 'n'>('n') as never,
  ),
  startWith: pipeWith(startWith(0) as never),
  endWith: pipeWith(endWith(9) as never),
  pairwise: pipeWith(pairwise() as never),
  first: pipeWith(first() as never),
  last: pipeWith(last() as never),
  takeLast: pipeWith(takeLast(2) as never),
  skipLast: pipeWith(skipLast(1) as never),
  reduce: pipeWith(reduce((a: number, n: number) => a + n, 0) as never),
  count: pipeWith(count() as never),
  min: pipeWith(min() as never),
  max: pipeWith(max() as never),
  every: pipeWith(every((n: number) => n >= 0) as never),
  isEmpty: pipeWith(isEmpty() as never),
  find: pipeWith(find((n: number) => n > 5) as never),
  findIndex: pipeWith(findIndex((n: number) => n > 5) as never),
  single: pipeWith(single() as never),
  elementAt: pipeWith(elementAt(3) as never),
  throwIfEmpty: pipeWith(throwIfEmpty() as never),
  defaultIfEmpty: pipeWith(defaultIfEmpty(0) as never),
  ignoreElements: pipeWith(ignoreElements() as never),
  mapTo: pipeWith(mapTo('x') as never),
  finalize: pipeWith(finalize(() => undefined) as never),
  timestamp: pipeWith(timestamp() as never),
  timeInterval: pipeWith(timeInterval() as never),
  debounce: pipeWith(debounce(10) as never),
  throttle: pipeWith(throttle(10) as never),
  auditTime: pipeWith(auditTime(10) as never),
  audit: pipeWith(audit(() => timer(10)) as never),
  sampleTime: pipeWith(sampleTime(10) as never),
  delay: pipeWith(delay(10) as never),
  bufferCount: pipeWith(bufferCount(2) as never),
  bufferTime: pipeWith(bufferTime(10) as never),
  switchMap: pipeWith(switchMap((n: number) => of(n)) as never),
  mergeMap: pipeWith(mergeMap((n: number) => of(n)) as never),
  concatMap: pipeWith(concatMap((n: number) => of(n)) as never),
  exhaustMap: pipeWith(exhaustMap((n: number) => of(n)) as never),
  share: pipeWith(share() as never),
  shareReplay: pipeWith(shareReplay(1, { resetOnRefCountZero: true }) as never),
  observeOn: pipeWith(observeOn(0) as never),
  subscribeOn: pipeWith(subscribeOn(0) as never),
};

let clock: VirtualCraftTemporalRuntime;
let restoreClock: () => void;

beforeEach(() => {
  clock = new VirtualCraftTemporalRuntime();
  restoreClock = activateCraftTemporalRuntime(clock);
});

afterEach(() => {
  restoreClock();
});

function observe(stream: AnyCraftStream) {
  const seen = {
    values: [] as unknown[],
    exceptions: [] as unknown[],
    errors: [] as unknown[],
    completed: 0,
    terminals: [] as string[],
  };
  const subscription = stream.subscribe({
    next: (value: unknown) => {
      seen.values.push(value);
    },
    exception: (exception: unknown) => {
      seen.exceptions.push(exception);
      seen.terminals.push('exception');
    },
    error: (error: unknown) => {
      seen.errors.push(error);
      seen.terminals.push('error');
    },
    complete: () => {
      seen.completed += 1;
      seen.terminals.push('complete');
    },
  });
  return { seen, subscription };
}

describe.each(Object.entries(operators))('%s', (_name, op) => {
  it('releases its source on unsubscribe and delivers nothing afterwards', async () => {
    const source = spySource();
    const { seen, subscription } = observe(op(source.stream));
    // `subscribeOn` subscribes its source after a delay: let it happen.
    await clock.advanceBy(1);
    expect(source.subscribed).toBeGreaterThanOrEqual(1);

    subscription.unsubscribe();
    const before = structuredClone(seen.values);
    source.subject.next(1);
    source.subject.next(2);
    await clock.advanceBy(100);

    expect(source.unsubscribed).toBe(source.subscribed);
    expect(seen.values).toEqual(before);
    expect(seen.terminals).toEqual([]);
  });

  it('ends with the source typed exception, once, and nothing after it', async () => {
    const source = spySource();
    const { seen } = observe(op(source.stream));
    const boom = craftException({ _tag: 'Boom' }, { why: 'x' });

    (source.subject as Subject<number, unknown>).exception(boom);
    source.subject.next(7);
    await clock.advanceBy(100);

    expect(seen.exceptions).toHaveLength(1);
    expect(seen.terminals).toEqual(['exception']);
    expect(source.unsubscribed).toBe(source.subscribed);
  });

  it('ends with the source defect, once, and nothing after it', async () => {
    const source = spySource();
    const { seen } = observe(op(source.stream));
    const defect = new Error('defect');

    (source.subject as Subject<number, unknown>).error(defect);
    source.subject.next(7);
    await clock.advanceBy(100);

    expect(seen.errors).toEqual([defect]);
    expect(seen.terminals).toEqual(['error']);
    expect(source.unsubscribed).toBe(source.subscribed);
  });
});

describe('subscribeOn', () => {
  it('never subscribes the source when it is unsubscribed before the delay', async () => {
    const source = spySource();
    const { subscription } = observe(
      source.stream.pipe(subscribeOn(50)) as AnyCraftStream,
    );

    subscription.unsubscribe();
    await clock.advanceBy(100);

    expect(source.subscribed).toBe(0);
  });
});

// --- operators with more than one input ------------------------------------------

type Multi = {
  build: (
    a: CraftStream<number, never>,
    b: CraftStream<number, never>,
  ) => AnyCraftStream;
  /** `b` is only subscribed once `a` is done (concat). */
  sequential?: boolean;
};

const multi: Record<string, Multi> = {
  merge: { build: (a, b) => merge(a, b) },
  combineLatest: { build: (a, b) => combineLatest([a, b]) },
  zip: { build: (a, b) => zip(a, b) },
  race: { build: (a, b) => race(a, b) },
  forkJoin: { build: (a, b) => forkJoin([a, b]) },
  concat: { build: (a, b) => concat(a, b), sequential: true },
  withLatestFrom: {
    build: (a, b) => a.pipe(withLatestFrom(b)) as AnyCraftStream,
  },
  takeUntil: { build: (a, b) => a.pipe(takeUntil(b)) as AnyCraftStream },
  skipUntil: { build: (a, b) => a.pipe(skipUntil(b)) as AnyCraftStream },
  sample: { build: (a, b) => a.pipe(sample(b)) as AnyCraftStream },
  buffer: { build: (a, b) => a.pipe(buffer(b)) as AnyCraftStream },
  bufferWhen: {
    build: (a, b) => a.pipe(bufferWhen(() => b)) as AnyCraftStream,
  },
  window: { build: (a, b) => a.pipe(window(b)) as AnyCraftStream },
  windowCount: { build: (a) => a.pipe(windowCount(2)) as AnyCraftStream },
  groupBy: {
    build: (a) => a.pipe(groupBy((n: number) => n % 2)) as AnyCraftStream,
  },
  expand: {
    build: (a, b) => a.pipe(expand(() => b)) as AnyCraftStream,
  },
};

describe.each(Object.entries(multi))(
  '%s (several inputs)',
  (_name, { build, sequential }) => {
    it('releases every input on unsubscribe', async () => {
      const a = spySource();
      const b = spySource();
      const { subscription } = observe(build(a.stream, b.stream));

      subscription.unsubscribe();
      a.subject.next(1);
      b.subject.next(1);
      await clock.advanceBy(100);

      expect(a.unsubscribed).toBe(a.subscribed);
      expect(b.unsubscribed).toBe(b.subscribed);
    });

    it('ends once with a typed exception from the first input', async () => {
      const a = spySource();
      const b = spySource();
      const { seen } = observe(build(a.stream, b.stream));
      const boom = craftException({ _tag: 'Boom' }, { why: 'x' });

      (a.subject as Subject<number, unknown>).exception(boom);
      a.subject.next(2);
      b.subject.next(2);

      expect(seen.exceptions).toHaveLength(1);
      expect(seen.terminals).toEqual(['exception']);
      expect(a.unsubscribed).toBe(a.subscribed);
      expect(b.unsubscribed).toBe(b.subscribed);
    });

    it('ends once with a defect from the first input', async () => {
      const a = spySource();
      const b = spySource();
      const { seen } = observe(build(a.stream, b.stream));
      const defect = new Error('defect');

      (a.subject as Subject<number, unknown>).error(defect);
      a.subject.next(2);

      expect(seen.errors).toEqual([defect]);
      expect(seen.terminals).toEqual(['error']);
      expect(b.unsubscribed).toBe(b.subscribed);
    });

    it.skipIf(sequential)(
      'ends once with a defect from the second input',
      async () => {
        const a = spySource();
        const b = spySource();
        const { seen } = observe(build(a.stream, b.stream));
        const defect = new Error('late defect');

        (b.subject as Subject<number, unknown>).error(defect);
        // Inputs that do not take a second stream have nothing to fail.
        if (b.subscribed === 0) return;

        expect(seen.errors).toEqual([defect]);
        expect(a.unsubscribed).toBe(a.subscribed);
      },
    );
  },
);

describe('groupBy and window hand failures to their inner streams', () => {
  const boom = craftException({ _tag: 'Boom' }, { why: 'x' });

  it('groupBy: exception, defect and completion reach every open group', () => {
    for (const end of ['exception', 'error', 'complete'] as const) {
      const live = subject<number, never>();
      const groups: Array<{ key: number; seen: string[] }> = [];
      fromSubscribable(live)
        .pipe(groupBy((n: number) => n % 2))
        .subscribe({
          next: (group: CraftStream<number, never> & { key: number }) => {
            const entry = { key: group.key, seen: [] as string[] };
            groups.push(entry);
            group.subscribe({
              exception: () => entry.seen.push('exception'),
              error: () => entry.seen.push('error'),
              complete: () => entry.seen.push('complete'),
            });
          },
          exception: () => undefined,
          error: () => undefined,
        });
      live.next(1);
      live.next(2);
      if (end === 'exception')
        (live as Subject<number, unknown>).exception(boom);
      else if (end === 'error')
        (live as Subject<number, unknown>).error(new Error('x'));
      else live.complete();

      expect(groups.map((g) => g.key).sort()).toEqual([0, 1]);
      expect(groups.every((g) => g.seen.join() === end)).toBe(true);
    }
  });

  it('groupBy: a key selector that throws is a defect', () => {
    const errors: unknown[] = [];
    of(1)
      .pipe(
        groupBy(() => {
          throw new Error('bad key');
        }),
      )
      .subscribe({ error: (error: unknown) => errors.push(error) });

    expect(errors).toHaveLength(1);
  });

  it('window: failures reach the current window', () => {
    for (const end of ['exception', 'error'] as const) {
      const live = subject<number, never>();
      const opening = subject<number, never>();
      const inner: string[] = [];
      fromSubscribable(live)
        .pipe(window(fromSubscribable(opening)))
        .subscribe({
          next: (win: CraftStream<number, never>) =>
            win.subscribe({
              exception: () => inner.push('exception'),
              error: () => inner.push('error'),
            }),
          exception: () => undefined,
          error: () => undefined,
        });
      if (end === 'exception')
        (live as Subject<number, unknown>).exception(boom);
      else (live as Subject<number, unknown>).error(new Error('x'));

      expect(inner).toEqual([end]);
    }
  });

  it('window: a failing opening stream fails the current window and the result', () => {
    const live = subject<number, never>();
    const opening = subject<number, never>();
    const inner: string[] = [];
    const outer: string[] = [];
    fromSubscribable(live)
      .pipe(window(fromSubscribable(opening)))
      .subscribe({
        next: (win: CraftStream<number, never>) =>
          win.subscribe({ error: () => inner.push('error') }),
        error: () => outer.push('error'),
      });

    (opening as Subject<number, unknown>).error(new Error('opening broke'));

    expect(inner).toEqual(['error']);
    expect(outer).toEqual(['error']);
  });
});
