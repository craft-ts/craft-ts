import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import {
  VirtualCraftTemporalRuntime,
  activateCraftTemporalRuntime,
  craftException,
  subject,
  type RuntimeTemporalAwaitRequest,
  type Subject,
} from '@craft-ts/core';
import {
  auditTime,
  bufferWhen,
  empty,
  expand,
  fail,
  fromEvent,
  fromSubscribable,
  interval,
  map,
  of,
  take,
  timer,
  windowCount,
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

describe('interval and timer', () => {
  it('interval emits 0, 1, 2… every period until unsubscribed', async () => {
    const result = record(interval(100));
    expect(result.values).toEqual([]);
    await clock.advanceBy(250);
    expect(result.values).toEqual([0, 1]);
    result.unsubscribe();
    await clock.advanceBy(1000);

    expect(result.values).toEqual([0, 1]);
    expect(clock.pendingTasks()).toEqual([]);
  });

  it('interval is bounded by take', async () => {
    const result = record(interval(10).pipe(take(3)));
    await clock.advanceBy(100);

    expect(result.values).toEqual([0, 1, 2]);
    expect(result.completed).toBe(1);
    expect(clock.pendingTasks()).toEqual([]);
  });

  it('timer(due) emits once then completes; timer(due, period) keeps going', async () => {
    const once = record(timer(50));
    const repeating = record(timer(50, 20));
    await clock.advanceBy(50);
    expect(once.values).toEqual([0]);
    expect(once.completed).toBe(1);
    await clock.advanceBy(40);

    expect(repeating.values).toEqual([0, 1, 2]);
    repeating.unsubscribe();
  });

  it('marks time sources as asynchronous in their type', () => {
    expectTypeOf(interval(1)).toEqualTypeOf<
      CraftStream<number, RuntimeTemporalAwaitRequest>
    >();
  });
});

describe('fromEvent', () => {
  it('emits the events of a target and removes its listener on unsubscribe', () => {
    const target = new EventTarget();
    const remove = vi.spyOn(target, 'removeEventListener');
    const result = record(fromEvent<CustomEvent<number>>(target, 'ping'));
    target.dispatchEvent(new CustomEvent('ping', { detail: 1 }));
    target.dispatchEvent(new CustomEvent('ping', { detail: 2 }));
    result.unsubscribe();
    target.dispatchEvent(new CustomEvent('ping', { detail: 3 }));

    expect(result.values.map((event) => event.detail)).toEqual([1, 2]);
    expect(remove).toHaveBeenCalledOnce();
  });
});

describe('auditTime', () => {
  it('emits the latest value at the end of a window, never at the start', async () => {
    const input = hot<number>();
    const result = record(input.stream.pipe(auditTime(100)));
    input.source.next(1);
    input.source.next(2);
    expect(result.values).toEqual([]);
    await clock.advanceBy(100);
    expect(result.values).toEqual([2]);

    input.source.next(3);
    await clock.advanceBy(100);
    expect(result.values).toEqual([2, 3]);
  });

  it('flushes the pending value on completion', () => {
    const input = hot<number>();
    const result = record(input.stream.pipe(auditTime(100)));
    input.source.next(1);
    input.source.complete();

    expect(result.values).toEqual([1]);
    expect(result.completed).toBe(1);
  });
});

describe('windowCount', () => {
  it('hands out an inner stream per `size` values', () => {
    const windows: number[][] = [];
    of(1, 2, 3, 4, 5)
      .pipe(windowCount(2))
      .subscribe({
        next: (window) => {
          const values: number[] = [];
          windows.push(values);
          window.subscribe({ next: (v) => values.push(v) });
        },
      });

    expect(windows).toEqual([[1, 2], [3, 4], [5]]);
    expect(() => windowCount(0)).toThrow(RangeError);
  });
});

describe('bufferWhen', () => {
  it('flushes when the selected stream emits, then selects a new one', () => {
    const input = hot<number>();
    const ticks = [hot<void>(), hot<void>(), hot<void>()];
    let selected = 0;
    const result = record(
      input.stream.pipe(bufferWhen(() => ticks[selected++].stream)),
    );
    input.source.next(1);
    input.source.next(2);
    ticks[0].source.next();
    input.source.next(3);
    ticks[1].source.next();
    input.source.next(4);
    input.source.complete();

    expect(result.values).toEqual([[1, 2], [3], [4]]);
    // A new closing stream is selected after every flush, and once at the start.
    expect(selected).toBe(3);
  });
});

describe('expand', () => {
  it('feeds the projection results back in, ending when a projection is empty', () => {
    const result = record(
      of(1).pipe(expand((n) => (n < 20 ? of(n * 2) : empty()))),
    );

    expect(result.values).toEqual([1, 2, 4, 8, 16, 32]);
    expect(result.completed).toBe(1);
  });

  it('is bounded by take for an unbounded recursion', () => {
    const result = record(
      of(1).pipe(
        expand((n) => of(n + 1)),
        take(5),
      ),
    );

    expect(result.values).toEqual([1, 2, 3, 4, 5]);
    expect(result.completed).toBe(1);
  });

  it('terminates with an inner exception', () => {
    const boom = fail(craftException({ _tag: 'Boom' as const }));
    const result = record(
      of(1).pipe(expand(() => boom as unknown as CraftStream<number>)),
    );

    expect(result.values).toEqual([1]);
    expect(result.exceptions).toHaveLength(1);
  });

  it('accepts a generator projection', () => {
    const result = record(
      of(1).pipe(
        expand(function* (n) {
          return n < 3 ? of(n + 1) : empty();
        }),
        map((n) => n * 10),
      ),
    );

    expect(result.values).toEqual([10, 20, 30]);
  });
});
