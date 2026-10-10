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
  type CraftException,
  type Subject,
} from '@craft-ts/core';
import {
  connectable,
  dematerialize,
  empty,
  fail,
  fromSubscribable,
  map,
  materialize,
  multicast,
  observeOn,
  of,
  publish,
  publishBehavior,
  publishReplay,
  refCount,
  subscribeOn,
  tap,
  type CraftStream,
  type StreamNotification,
} from '../index';

type Boom = CraftException<{ _tag: 'Boom'; scope: undefined }, { why: string }>;
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

function hot<A>() {
  const emitter = subject<A>();
  return {
    emitter,
    stream: fromSubscribable(emitter as Subject<A, never>) as CraftStream<
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

describe('materialize / dematerialize', () => {
  it('reifies values and completion, then completes', () => {
    const result = record(of(1, 2).pipe(materialize()));

    expect(result.values).toEqual([
      { kind: 'N', value: 1 },
      { kind: 'N', value: 2 },
      { kind: 'C' },
    ]);
    expect(result.completed).toBe(1);
  });

  it('turns a typed exception into an X value (and removes it from the type)', () => {
    const stream = fail(boom()).pipe(materialize());
    const result = record(stream);

    expect(result.exceptions).toEqual([]);
    expect(result.values).toHaveLength(1);
    expect((result.values[0] as { kind: string }).kind).toBe('X');
    expect(result.completed).toBe(1);
    expectTypeOf(stream).toExtend<
      CraftStream<StreamNotification<never, Boom>, never>
    >();
  });

  it('turns a defect into an E value', () => {
    const failure = new Error('defect');
    const result = record(
      of(1).pipe(
        map(() => {
          throw failure;
        }),
        materialize(),
      ),
    );

    expect(result.values).toEqual([{ kind: 'E', error: failure }]);
    expect(result.errors).toEqual([]);
  });

  it('round-trips through dematerialize, exceptions included', () => {
    expect(
      record(of(1, 2).pipe(materialize(), dematerialize())).values,
    ).toEqual([1, 2]);

    const back = record(fail(boom()).pipe(materialize(), dematerialize()));
    expect(back.exceptions).toHaveLength(1);

    const failure = new Error('defect');
    const defect = record(
      of(1).pipe(
        map(() => {
          throw failure;
        }),
        materialize(),
        dematerialize(),
      ),
    );
    expect(defect.errors).toEqual([failure]);
    expect(record(empty().pipe(materialize(), dematerialize())).completed).toBe(
      1,
    );
  });
});

describe('observeOn / subscribeOn', () => {
  it('observeOn re-delivers values and completion on the clock, in order', async () => {
    const result = record(of(1, 2).pipe(observeOn(10)));
    expect(result.values).toEqual([]);
    await clock.advanceBy(10);

    expect(result.values).toEqual([1, 2]);
    expect(result.completed).toBe(1);
  });

  it('observeOn also defers exceptions and cancels with the subscription', async () => {
    const result = record(fail(boom()).pipe(observeOn()));
    expect(result.exceptions).toEqual([]);
    await clock.advanceBy(0);
    expect(result.exceptions).toHaveLength(1);

    const input = hot<number>();
    const cancelled = record(input.stream.pipe(observeOn(50)));
    input.emitter.next(1);
    cancelled.unsubscribe();
    await clock.advanceBy(100);

    expect(cancelled.values).toEqual([]);
    expect(clock.pendingTasks()).toEqual([]);
  });

  it('subscribeOn subscribes later, and not at all if cancelled first', async () => {
    const subscribed = vi.fn();
    const result = record(of(1).pipe(tap(subscribed), subscribeOn(20)));
    expect(subscribed).not.toHaveBeenCalled();
    await clock.advanceBy(20);
    expect(subscribed).toHaveBeenCalledOnce();
    expect(result.values).toEqual([1]);

    const early = vi.fn();
    const cancelled = record(of(1).pipe(tap(early), subscribeOn(20)));
    cancelled.unsubscribe();
    await clock.advanceBy(100);
    expect(early).not.toHaveBeenCalled();
  });
});

describe('connectable and the publish family', () => {
  it('connectable runs the source only on connect, once, for every subscriber', () => {
    const runs = vi.fn();
    const live = connectable(of(1, 2).pipe(tap(runs)));
    const a = record(live);
    const b = record(live);
    expect(runs).not.toHaveBeenCalled();
    expect(live.connected).toBe(false);

    live.connect();
    live.connect();

    expect(runs).toHaveBeenCalledTimes(2); // once per value, not per subscriber
    expect(a.values).toEqual([1, 2]);
    expect(b.values).toEqual([1, 2]);
  });

  it('disconnecting stops the flow and starts over with a fresh hub', () => {
    const input = hot<number>();
    const live = connectable(input.stream);
    const a = record(live);
    const connection = live.connect();
    input.emitter.next(1);
    connection.unsubscribe();
    input.emitter.next(2);

    expect(a.values).toEqual([1]);
    expect(live.connected).toBe(false);
  });

  it('publish + refCount behaves like share: connect on first, disconnect on last', () => {
    const connects = vi.fn();
    const disconnects = vi.fn();
    const live = subject<number>();
    const source = fromSubscribable<number>({
      subscribe: (observer) => {
        connects();
        const subscription = live.subscribe(observer);
        return {
          unsubscribe() {
            disconnects();
            subscription.unsubscribe();
          },
        };
      },
    }).pipe(publish(), refCount());

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

  it('publish + refCount delivers a synchronous source to the first subscriber', () => {
    expect(record(of(1, 2).pipe(publish(), refCount())).values).toEqual([1, 2]);
  });

  it('publishReplay and publishBehavior give late subscribers a value', () => {
    // Applied directly: `.pipe(...)` types its result as a plain stream, which
    // hides `connect` (use `connectable(...)` or pair with `refCount()`).
    const replayed = publishReplay(2)(of(1, 2, 3));
    replayed.connect();
    expect(record(replayed).values).toEqual([2, 3]);

    const behavior = publishBehavior(0)(hot<number>().stream);
    expect(record(behavior).values).toEqual([0]);
  });

  it('multicast accepts a subject or a factory', () => {
    const shared = subject<number>();
    const viaSubject = multicast(shared)(of(1));
    const seen: number[] = [];
    shared.subscribe({ next: (v) => seen.push(v) });
    viaSubject.connect();
    expect(seen).toEqual([1]);

    const viaFactory = multicast(() => subject<number>())(of(5));
    const result = record(viaFactory);
    viaFactory.connect();
    expect(result.values).toEqual([5]);
  });

  it('refCount refuses a stream that is not connectable', () => {
    const result = record(of(1).pipe(refCount()));

    expect(String(result.errors[0])).toMatch(/must follow publish/);
  });

  it('forwards the exception of the source to every subscriber', () => {
    const live = publish()(fail(boom()));
    const a = record(live);
    live.connect();

    expect(a.exceptions).toHaveLength(1);
  });
});
