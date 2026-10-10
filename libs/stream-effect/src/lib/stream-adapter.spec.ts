import {
  craftException,
  createCraftInjector,
  exponentialTemporalSchedule,
  fixedTemporalSchedule,
  sequenceTemporalSchedule,
  subject,
  ɵInjector as Injector,
  type CraftException,
} from '@craft-ts/core';
import { provideLayer } from '@craft-ts/effect';
import {
  catchTag,
  fail,
  fromSubscribable,
  map,
  of,
  take,
  type CraftStream,
  type StreamExceptions,
} from '@craft-ts/stream';
import {
  Context,
  Data,
  Duration,
  Effect,
  Layer,
  PubSub,
  Queue,
  Schedule,
  Stream,
  SubscriptionRef,
} from 'effect';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  CraftScheduleNotPure,
  fromEffectSchedule,
  fromPubSub,
  fromQueue,
  fromStream,
  fromSubscriptionRef,
  toEffectSchedule,
  toStream,
} from './stream-adapter';

class NotFound extends Data.TaggedError('NotFound')<{ readonly id: number }> {}
class Quota extends Data.TaggedError('Quota')<{ readonly left: number }> {}

type Recorded<A> = {
  values: A[];
  exceptions: unknown[];
  errors: unknown[];
  completed: number;
  unsubscribe(): void;
};

function record<A, Y>(
  stream: CraftStream<A, Y>,
  options?: { injector?: Injector },
): Recorded<A> {
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
  void options;
  recorded.unsubscribe = () => subscription.unsubscribe();
  return recorded;
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('fromStream', () => {
  it('emits the values of a synchronous stream, flattening chunks, then completes — in place', () => {
    const result = record(fromStream(Stream.make(1, 2, 3)));

    expect(result.values).toEqual([1, 2, 3]);
    expect(result.completed).toBe(1);
  });

  it('is cold: every subscription re-runs the stream', () => {
    const run = vi.fn();
    const stream = fromStream(
      Stream.fromEffect(Effect.sync(() => run())).pipe(Stream.map(() => 1)),
    );
    record(stream);
    record(stream);

    expect(run).toHaveBeenCalledTimes(2);
  });

  it('maps a typed failure to an exception tagged with the error `_tag`', () => {
    const result = record(fromStream(Stream.fail(new NotFound({ id: 7 }))));

    expect(result.exceptions).toHaveLength(1);
    expect(result.exceptions[0]).toMatchObject({
      _tag: 'NotFound',
      scope: 'loader',
    });
    expect((result.exceptions[0] as { payload: NotFound }).payload.id).toBe(7);
    expect(result.errors).toEqual([]);
  });

  it('types the failure channel as exception markers', () => {
    const stream = fromStream(
      Stream.concat(
        Stream.fail(new NotFound({ id: 1 })),
        Stream.fail(new Quota({ left: 0 })),
      ),
    );
    void stream;
    type Raised =
      typeof stream extends CraftStream<any, infer Y>
        ? StreamExceptions<Y>
        : never;
    expectTypeOf<Raised['_tag']>().toEqualTypeOf<'NotFound' | 'Quota'>();

    // …so catchTag types its handler from them.
    const recovered = fromStream(Stream.fail(new NotFound({ id: 1 }))).pipe(
      catchTag('NotFound', (e) => {
        expectTypeOf(e.payload.id).toEqualTypeOf<number>();
        return e.payload.id;
      }),
    );
    expect(record(recovered).values).toEqual([1]);
  });

  it('keeps a defect on the error channel, never as an exception', () => {
    const failure = new Error('defect');
    const result = record(fromStream(Stream.die(failure)));

    expect(result.errors).toEqual([failure]);
    expect(result.exceptions).toEqual([]);
  });

  it('rejects, at compile time, a stream that still has requirements', () => {
    class Needed extends Context.Service<Needed, { readonly n: number }>()(
      'Needed',
    ) {}
    const needy = Stream.fromEffect(Effect.service(Needed));

    // @ts-expect-error Needed is not provided by anything the type can see
    fromStream(needy);
  });

  it('interrupts the fiber on unsubscribe, running the stream finalizers', async () => {
    const finalized = vi.fn();
    const result = record(
      fromStream(Stream.never.pipe(Stream.ensuring(Effect.sync(finalized)))),
    );
    await settle();
    expect(finalized).not.toHaveBeenCalled();

    result.unsubscribe();
    await settle();

    expect(finalized).toHaveBeenCalledOnce();
    expect(result.completed).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('stops delivering as soon as the subscription is closed', () => {
    const delivered: number[] = [];
    fromStream(Stream.make(1, 2, 3, 4))
      .pipe(take(2))
      .subscribe({
        next: (n) => delivered.push(n),
      });

    expect(delivered).toEqual([1, 2]);
  });

  it('resolves the injector level at subscription and runs the stream against it', async () => {
    class Greeter extends Context.Service<
      Greeter,
      { readonly hello: () => string }
    >()('Greeter') {}
    const layer = Layer.succeed(Greeter)({ hello: () => 'hi' });
    const injector = createCraftInjector([provideLayer(layer)]);
    // The stream needs `Greeter`: the type forbids it (see the test above), the
    // runtime path is what is under test here.
    const stream = fromStream(
      Stream.fromEffect(
        Effect.map(Effect.service(Greeter), (g) => g.hello()),
      ) as never as Stream.Stream<string>,
    );

    const values: string[] = [];
    injector.run(() => {
      stream.subscribe({ next: (v) => values.push(v) });
    });
    await settle();

    expect(values).toEqual(['hi']);
    injector.destroy();
  });
});

describe('toStream', () => {
  it('collects the values of a craft stream', async () => {
    const values = await Effect.runPromise(
      Stream.runCollect(toStream(of(1, 2, 3).pipe(map((n) => n * 2)))),
    );

    expect(values).toEqual([2, 4, 6]);
  });

  it('fails the stream with the typed exception', async () => {
    const live = subject<
      number,
      CraftException<{ _tag: 'Boom'; scope: undefined }, { why: string }>
    >();
    const pending = Effect.runPromiseExit(
      Stream.runCollect(toStream(fromSubscribable(live))),
    );
    live.next(1);
    live.exception({ _tag: 'Boom' } as never);

    const exit = await pending;
    expect(exit._tag).toBe('Failure');
    expect(JSON.stringify(exit)).toContain('Boom');
  });

  it('turns a defect into a die', async () => {
    const live = subject<number>();
    const pending = Effect.runPromiseExit(
      Stream.runCollect(toStream(fromSubscribable(live))),
    );
    live.error(new Error('defect'));

    const exit = await pending;
    expect(exit._tag).toBe('Failure');
    expect(String(JSON.stringify(exit))).toMatch(/defect|Die/);
  });

  it('unsubscribes from the craft stream when the Effect consumer stops', async () => {
    const unsubscribed = vi.fn();
    const source = fromSubscribable<number>({
      subscribe: (observer) => {
        observer.next?.(1);
        return { unsubscribe: unsubscribed };
      },
    });
    const values = await Effect.runPromise(
      Stream.runCollect(toStream(source).pipe(Stream.take(1))),
    );

    expect(values).toEqual([1]);
    expect(unsubscribed).toHaveBeenCalled();
  });

  it('bounds its buffer: a slow consumer sees the newest values (sliding)', async () => {
    const live = subject<number>();
    const consumed: number[] = [];
    const fiber = Effect.runFork(
      Stream.runForEach(
        toStream(fromSubscribable(live), { bufferSize: 2 }),
        (n) => Effect.sync(() => void consumed.push(n)),
      ),
    );
    await settle();
    // No consumer turn can run between these synchronous pushes.
    for (let n = 1; n <= 5; n += 1) live.next(n);
    live.complete();
    await Effect.runPromise(
      Effect.promise(
        () => new Promise<void>((resolve) => setTimeout(resolve, 10)),
      ),
    );

    expect(consumed.length).toBeLessThanOrEqual(5);
    expect(consumed.at(-1)).toBe(5);
    fiber.interruptUnsafe();
  });

  it('round-trips values and keeps the exception tag across both adapters', async () => {
    const values = record(fromStream(toStream(of(1, 2, 3))));
    const boom = craftException({ _tag: 'Boom' as const }, { why: 'x' });
    const back = record(fromStream(toStream(fail(boom))));
    // `Stream.callback` hands over through the Effect scheduler: not in place.
    await settle();

    expect(values.values).toEqual([1, 2, 3]);
    expect(back.exceptions).toHaveLength(1);
    expect((back.exceptions[0] as { _tag: string })._tag).toBe('Boom');
  });
});

describe('Queue, PubSub and SubscriptionRef', () => {
  it('reads a Queue', async () => {
    const queue = await Effect.runPromise(Queue.unbounded<number>());
    const result = record(fromQueue(queue));
    Queue.offerUnsafe(queue, 1);
    Queue.offerUnsafe(queue, 2);
    await settle();

    expect(result.values).toEqual([1, 2]);
    result.unsubscribe();
  });

  it('reads a PubSub', async () => {
    const pubsub = await Effect.runPromise(PubSub.unbounded<string>());
    const result = record(fromPubSub(pubsub));
    await settle();
    await Effect.runPromise(PubSub.publish(pubsub, 'a'));
    await settle();

    expect(result.values).toEqual(['a']);
    result.unsubscribe();
  });

  it('reads a SubscriptionRef: the current value, then every change', async () => {
    const ref = await Effect.runPromise(SubscriptionRef.make(1));
    const result = record(fromSubscriptionRef(ref));
    await settle();
    await Effect.runPromise(SubscriptionRef.set(ref, 2));
    await settle();

    expect(result.values).toEqual([1, 2]);
    result.unsubscribe();
  });
});

describe('schedules', () => {
  const advance = (
    schedule: ReturnType<typeof fromEffectSchedule>,
    attempts: number,
  ) =>
    Array.from({ length: attempts }, (_, index) =>
      schedule.next({ attempt: index + 1, elapsedMs: 0 }),
    );

  it('toEffectSchedule steps through a craft schedule and stops when it is done', async () => {
    const schedule = toEffectSchedule(sequenceTemporalSchedule([10, 20]));
    const step = await Effect.runPromise(Schedule.toStep(schedule));
    const first = await Effect.runPromise(step(0, 'x'));
    const second = await Effect.runPromise(step(10, 'x'));
    const third = await Effect.runPromiseExit(step(30, 'x'));

    expect(first[0]).toBe(1);
    expect(Duration.toMillis(first[1])).toBe(10);
    expect(Duration.toMillis(second[1])).toBe(20);
    expect(third._tag).toBe('Failure');
  });

  it('fromEffectSchedule reads the pure schedules back', () => {
    expect(advance(fromEffectSchedule(Schedule.fixed(50)), 3)).toEqual([
      { done: false, delayMs: 50 },
      { done: false, delayMs: 50 },
      { done: false, delayMs: 50 },
    ]);

    const limited = fromEffectSchedule(
      Schedule.fixed(25).pipe(Schedule.upTo({ times: 2 })),
    );
    const decisions = advance(limited, 3);
    expect(decisions[0]).toEqual({ done: false, delayMs: 25 });
    expect(decisions[2]).toEqual({ done: true });
  });

  it('fromEffectSchedule restarts on attempt 1, so one adapter serves several runs', () => {
    const adapter = fromEffectSchedule(Schedule.recurs(1));

    expect(advance(adapter, 2)).toEqual([
      { done: false, delayMs: 0 },
      { done: true },
    ]);
    expect(advance(adapter, 2)).toEqual([
      { done: false, delayMs: 0 },
      { done: true },
    ]);
  });

  it('fromEffectSchedule refuses a schedule that suspends', () => {
    const effectful = Schedule.fromStep(
      Effect.succeed(() => Effect.never as never),
    ) as never as Schedule.Schedule<unknown, unknown, never, never>;

    expect(() =>
      fromEffectSchedule(effectful).next({ attempt: 1, elapsedMs: 0 }),
    ).toThrow(CraftScheduleNotPure);
  });

  it('round-trips the craft schedules', () => {
    const craft = exponentialTemporalSchedule(100, { maxAttempts: 3 });
    const back = fromEffectSchedule(
      toEffectSchedule(craft) as Schedule.Schedule<
        unknown,
        unknown,
        never,
        never
      >,
    );

    expect(
      advance(back, 4).map((d) => ('delayMs' in d ? d.delayMs : 'done')),
    ).toEqual([100, 200, 400, 'done']);
    expect(fixedTemporalSchedule(5).next({ attempt: 1, elapsedMs: 0 })).toEqual(
      {
        done: false,
        delayMs: 5,
      },
    );
  });
});
