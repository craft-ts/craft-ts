import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import {
  VirtualCraftTemporalRuntime,
  activateCraftTemporalRuntime,
  craftException,
  EmptyStreamError,
  subject,
  type CraftGenExceptionMarker,
  type Subject,
} from '@craft-ts/core';
import {
  combineLatestAll,
  count,
  distinctUntilKeyChanged,
  elementAt,
  empty,
  every,
  fail,
  find,
  findIndex,
  forkJoin,
  fromSubscribable,
  iif,
  interval,
  isEmpty,
  map,
  mapTo,
  max,
  min,
  of,
  partition,
  raceWith,
  range,
  single,
  skipLast,
  StreamOutOfRangeError,
  StreamSequenceError,
  take,
  throwIfEmpty,
  timeInterval,
  timestamp,
  zipAll,
  zipWith,
  type CraftStream,
} from '../index';

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

function hot<A>() {
  const source = subject<A>();
  return {
    source,
    stream: fromSubscribable(source as Subject<A, never>) as CraftStream<A, never>,
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

const boom = () => craftException({ _tag: 'Boom' as const }, { why: 'x' });

describe('aggregates', () => {
  it('count counts every value, or the ones a predicate accepts; 0 when empty', () => {
    expect(record(of(1, 2, 3).pipe(count())).values).toEqual([3]);
    expect(
      record(of(1, 2, 3, 4).pipe(count((n: number) => n % 2 === 0))).values,
    ).toEqual([2]);
    expect(record(empty().pipe(count())).values).toEqual([0]);
  });

  it('min and max use the natural order or a comparer; nothing when empty', () => {
    expect(record(of(3, 1, 2).pipe(min())).values).toEqual([1]);
    expect(record(of(3, 1, 2).pipe(max())).values).toEqual([3]);
    const byLength = (a: string, b: string) => a.length - b.length;
    expect(record(of('aa', 'b', 'ccc').pipe(max(byLength))).values).toEqual([
      'ccc',
    ]);
    const none = record(empty().pipe(min()));
    expect(none.values).toEqual([]);
    expect(none.completed).toBe(1);
  });

  it('a throwing comparer ends the stream with a defect', () => {
    const result = record(
      of(1, 2).pipe(
        max<number>(() => {
          throw new Error('cmp');
        }),
      ),
    );
    expect(result.errors).toHaveLength(1);
  });
});

describe('emptiness and predicates', () => {
  it('every stops at the first failure', () => {
    expect(record(of(2, 4).pipe(every((n: number) => n % 2 === 0))).values).toEqual([true]);
    const result = record(of(2, 3, 4).pipe(every((n: number) => n % 2 === 0)));
    expect(result.values).toEqual([false]);
    expect(result.completed).toBe(1);
  });

  it('isEmpty answers at the first value, or at completion', () => {
    expect(record(empty().pipe(isEmpty())).values).toEqual([true]);
    expect(record(of(1, 2).pipe(isEmpty())).values).toEqual([false]);
  });

  it('find and findIndex give undefined / -1 when nothing matches', () => {
    expect(record(of(1, 2, 3).pipe(find((n: number) => n > 1))).values).toEqual([2]);
    expect(record(of(1).pipe(find((n: number) => n > 5))).values).toEqual([undefined]);
    expect(record(of(1, 2, 3).pipe(findIndex((n: number) => n > 1))).values).toEqual([1]);
    expect(record(of(1).pipe(findIndex((n: number) => n > 5))).values).toEqual([-1]);
  });

  it('find narrows with a type guard', () => {
    const stream = of<string | number>('a', 1).pipe(
      find((value): value is number => typeof value === 'number'),
    );
    expectTypeOf(stream).toEqualTypeOf<CraftStream<number | undefined, never>>();
  });

  it('single emits the only match; none or several are defects', () => {
    expect(record(of(7).pipe(single())).values).toEqual([7]);
    expect(record(of(1, 2, 3).pipe(single((n: number) => n === 2))).values).toEqual([2]);
    expect(record(empty().pipe(single())).errors[0]).toBeInstanceOf(EmptyStreamError);
    expect(record(of(1, 2).pipe(single())).errors[0]).toBeInstanceOf(
      StreamSequenceError,
    );
  });

  it('elementAt reaches an index, falls back to a default, or is a defect', () => {
    expect(record(of('a', 'b', 'c').pipe(elementAt(1))).values).toEqual(['b']);
    expect(record(of('a').pipe(elementAt(5, 'none'))).values).toEqual(['none']);
    expect(record(of('a').pipe(elementAt(5))).errors[0]).toBeInstanceOf(
      StreamOutOfRangeError,
    );
    // An explicit `undefined` default is still a default.
    expect(record(of('a').pipe(elementAt(5, undefined))).values).toEqual([undefined]);
  });

  it('throwIfEmpty raises a defect only on an empty source', () => {
    expect(record(of(1).pipe(throwIfEmpty())).values).toEqual([1]);
    expect(record(empty().pipe(throwIfEmpty())).errors[0]).toBeInstanceOf(
      EmptyStreamError,
    );
    const custom = new Error('nothing');
    expect(record(empty().pipe(throwIfEmpty(() => custom))).errors[0]).toBe(custom);
  });
});

describe('shaping values', () => {
  it('skipLast holds back the tail', () => {
    expect(record(of(1, 2, 3, 4).pipe(skipLast(2))).values).toEqual([1, 2]);
  });

  it('mapTo replaces every value', () => {
    expect(record(of(1, 2).pipe(mapTo('x'))).values).toEqual(['x', 'x']);
  });

  it('distinctUntilKeyChanged compares one property', () => {
    const rows = of({ id: 1, n: 'a' }, { id: 1, n: 'b' }, { id: 2, n: 'c' });
    expect(
      record(rows.pipe(distinctUntilKeyChanged('id'))).values.map((row) => row.n),
    ).toEqual(['a', 'c']);
  });

  it('timestamp and timeInterval read the temporal runtime', async () => {
    const live = hot<string>();
    const stamped = record(live.stream.pipe(timestamp()));
    const spaced = record(live.stream.pipe(timeInterval()));
    live.source.next('a');
    await clock.advanceBy(30);
    live.source.next('b');

    expect(stamped.values.map((v) => v.value)).toEqual(['a', 'b']);
    expect(stamped.values[1].timestamp - stamped.values[0].timestamp).toBe(30);
    expect(spaced.values.map((v) => v.interval)).toEqual([0, 30]);
  });
});

describe('creators', () => {
  it('range emits consecutive integers', () => {
    expect(record(range(5, 3)).values).toEqual([5, 6, 7]);
    expect(record(range(0, 0)).completed).toBe(1);
  });

  it('iif picks a branch per subscription', () => {
    let flag = true;
    const stream = iif(() => flag, of('yes'), of('no'));
    expect(record(stream).values).toEqual(['yes']);
    flag = false;
    expect(record(stream).values).toEqual(['no']);
    expect(record(iif(() => false, of(1))).completed).toBe(1);
  });

  it('iif merges both branches into the yielded type', () => {
    const stream = iif(() => true, of(1), fail(boom()));
    expectTypeOf(stream).toEqualTypeOf<
      CraftStream<number, CraftGenExceptionMarker<ReturnType<typeof boom>>>
    >();
  });
});

describe('forkJoin', () => {
  it('emits the last value of each input once all have completed', () => {
    expect(record(forkJoin([of(1, 2), of('a', 'b')])).values).toEqual([[2, 'b']]);
    expect(record(forkJoin({ n: of(1, 2), s: of('x') })).values).toEqual([
      { n: 2, s: 'x' },
    ]);
  });

  it('waits for the slowest input', () => {
    const a = hot<number>();
    const result = record(forkJoin([a.stream, of('z')]));
    a.source.next(1);
    a.source.next(2);
    expect(result.values).toEqual([]);
    a.source.complete();
    expect(result.values).toEqual([[2, 'z']]);
  });

  it('completes without a value when an input is empty', () => {
    const result = record(forkJoin([of(1), empty()]));
    expect(result.values).toEqual([]);
    expect(result.completed).toBe(1);
  });

  it('carries the exceptions of every input in its type', () => {
    const stream = forkJoin([of(1), fail(boom())] as const);
    expectTypeOf(stream).toEqualTypeOf<
      CraftStream<[number, never], CraftGenExceptionMarker<ReturnType<typeof boom>>>
    >();
    expect(record(stream).exceptions).toHaveLength(1);
  });
});

describe('partition', () => {
  it('splits by a predicate', () => {
    const [even, odd] = partition(of(1, 2, 3, 4), (n) => n % 2 === 0);
    expect(record(even).values).toEqual([2, 4]);
    expect(record(odd).values).toEqual([1, 3]);
  });

  it('narrows both halves with a type guard', () => {
    const [numbers, others] = partition(
      of<string | number>('a', 1),
      (value): value is number => typeof value === 'number',
    );
    expectTypeOf(numbers).toEqualTypeOf<CraftStream<number, never>>();
    expectTypeOf(others).toEqualTypeOf<CraftStream<string, never>>();
  });
});

describe('…With and …All', () => {
  it('zipWith pairs the source with the others', () => {
    expect(record(of(1, 2).pipe(zipWith(of('a', 'b')))).values).toEqual([
      [1, 'a'],
      [2, 'b'],
    ]);
  });

  it('raceWith follows the first to emit', () => {
    const slow = hot<string>();
    const fast = hot<string>();
    const result = record(slow.stream.pipe(raceWith(fast.stream)));
    fast.source.next('fast');
    slow.source.next('slow');
    expect(result.values).toEqual(['fast']);
  });

  it('zipAll and combineLatestAll combine the collected inner streams', () => {
    expect(
      record(of(of(1, 2), of(10, 20)).pipe(zipAll())).values,
    ).toEqual([
      [1, 10],
      [2, 20],
    ]);
    expect(
      record(of(of(1), of(2)).pipe(combineLatestAll())).values,
    ).toEqual([[1, 2]]);
  });

  it('unsubscribing while collecting releases the source', async () => {
    const result = record(
      interval(10).pipe(take(2), map((n) => of(n)), zipAll()),
    );
    await clock.advanceBy(100);
    expect(result.values).toEqual([[0, 1]]);
    result.unsubscribe();
  });
});
