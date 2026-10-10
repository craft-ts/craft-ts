import { craftException, type CraftTemporalSchedule } from '@craft-ts/core';
import {
  CraftEffectInterrupted,
  resolveEffectLevel,
  type EffectExceptionMarkers,
  type MissingRequirements,
  type RealRequirements,
} from '@craft-ts/effect';
import {
  captureStreamContext,
  createCraftStream,
  createSink,
  STREAM_RUN,
  type AnyCraftStream,
  type CraftStream,
  type StreamContextOptions,
  type StreamExceptions,
} from '@craft-ts/stream';
import {
  Cause,
  Duration,
  Effect,
  Exit,
  Option,
  Queue,
  Schedule,
  Stream,
  SubscriptionRef,
  type PubSub,
} from 'effect';

// ---------------------------------------------------------------------------
// Adapters between `CraftStream` and Effect's `Stream`.
//
// A `Stream` is not yieldable, so these are explicit functions, not a yield
// bridge. The channel mapping is the one `@craft-ts/effect` already uses to run
// a yielded Effect (`runYieldedEffect`), and none of the three channels is
// interchangeable:
//
//   success            -> values, then `complete`
//   typed failure `E`  -> a craft `exception`, tagged with the error's `_tag`
//   defect (`die`)     -> `error`: a bug, never a catchable exception
//   interruption       -> NOT an exception: a cancelled run is not a failure
//
// Differences that cannot be adapted away, documented rather than hidden:
// an Effect `Stream` is PULL (the consumer asks, so it has back-pressure) and a
// craft stream is PUSH. `fromStream` flattens chunks and pushes them; `toStream`
// needs a BOUNDED buffer, because a push producer cannot be told to wait.
// ---------------------------------------------------------------------------

/**
 * A stream whose requirements are not all provided by a `provideLayer` resolves
 * to this brand and fails at the call, naming what is missing. Phantom
 * requirements (`SyncOp`) are ignored, as everywhere in `@craft-ts/effect`.
 */
type StreamRequirementsCheck<R> = [RealRequirements<R>] extends [never]
  ? unknown
  : MissingRequirements<RealRequirements<R>>;

/**
 * Runs an Effect `Stream` as a craft stream.
 *
 * - The injector level (`provideLayer`) is resolved **at subscription**, not at
 *   construction: a cold stream may be built outside any injection context.
 * - Chunks are flattened: the craft stream emits value by value.
 * - Unsubscribing, or destroying the owner's `DestroyRef`, interrupts the fiber.
 * - Its failures type the result: `E` becomes `EffectExceptionMarkers<E>`.
 *
 * The stream is always asynchronous with respect to the Effect runtime's
 * scheduler: do not use it where a synchronous host (`craftComputed`,
 * `params`) must consume it in place.
 */
export function fromStream<A, E, R>(
  stream: Stream.Stream<A, E, R> & StreamRequirementsCheck<R>,
): CraftStream<A, EffectExceptionMarkers<E>> {
  return createCraftStream<A, unknown>((context, sink, teardown) => {
    const level = context.injector
      ? resolveEffectLevel(context.injector)
      : null;
    const run = level ? Effect.runForkWith(level.context) : Effect.runFork;

    const program = Stream.runForEachArray(
      stream as Stream.Stream<A, E, never>,
      (chunk) =>
        Effect.sync(() => {
          for (const value of chunk) {
            if (sink.closed) return;
            sink.next(value);
          }
        }),
    );

    // `runFork` starts the fiber synchronously, so a stream that never suspends
    // delivers everything — and settles — before `subscribe` returns.
    const fiber = (
      run as (
        effect: Effect.Effect<void, E, never>,
      ) => ReturnType<typeof Effect.runFork<void, E>>
    )(program);
    const stopObserving = fiber.addObserver((exit) => {
      if (Exit.isSuccess(exit)) {
        sink.complete();
        return;
      }
      const cause = exit.cause;
      // Interruption first: it has no typed error and is not a defect either.
      if (Cause.hasInterrupts(cause) && !Cause.hasFails(cause)) {
        // Interrupted by us (the subscription is closed) is the normal end of a
        // cancelled run; interrupted from elsewhere is reported.
        if (!sink.closed) sink.error(new CraftEffectInterrupted());
        return;
      }
      const failure = Cause.findErrorOption(cause);
      if (Option.isNone(failure)) {
        sink.error(Cause.squash(cause));
        return;
      }
      sink.exception(
        craftException(
          { _tag: errorTag(failure.value), scope: 'loader' },
          failure.value,
        ),
      );
    });

    teardown.add(() => {
      stopObserving();
      fiber.interruptUnsafe();
    });
  }) as unknown as CraftStream<A, EffectExceptionMarkers<E>>;
}

function errorTag(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    '_tag' in error &&
    typeof (error as { _tag?: unknown })._tag === 'string'
  ) {
    return (error as { _tag: string })._tag;
  }
  return 'EffectFailure';
}

export type ToStreamOptions = StreamContextOptions & {
  /** Capacity of the buffer between the craft producer and the Effect consumer. */
  readonly bufferSize?: number;
  /**
   * What gives when the buffer is full: `'sliding'` drops the oldest value,
   * `'dropping'` the newest. A craft producer is push and cannot be asked to
   * wait, so there is no `'suspend'`.
   */
  readonly strategy?: 'sliding' | 'dropping';
};

const DEFAULT_BUFFER_SIZE = 64;

/**
 * Exposes a craft stream as an Effect `Stream`.
 *
 * - A typed exception becomes the stream's failure (`E` is the craft exception
 *   union itself, `_tag` included); a defect becomes a `die`.
 * - The craft subscription is the stream's finalizer: ending, failing or
 *   interrupting the Effect consumer unsubscribes.
 * - The buffer is **bounded by default** (64, sliding): a push producer cannot
 *   honour back-pressure, and an unbounded queue would leak silently.
 */
export function toStream<A, Y>(
  stream: CraftStream<A, Y>,
  options: ToStreamOptions = {},
): Stream.Stream<A, StreamExceptions<Y>> {
  const context = captureStreamContext(options);
  return Stream.callback<A, StreamExceptions<Y>>(
    (queue) =>
      Effect.acquireRelease(
        Effect.sync(() =>
          (stream as AnyCraftStream)[STREAM_RUN](
            context,
            createSink<unknown>({
              next: (value) => {
                Queue.offerUnsafe(queue, value as A);
              },
              exception: (exception) => {
                Queue.failCauseUnsafe(
                  queue,
                  Cause.fail(exception as StreamExceptions<Y>),
                );
              },
              error: (error) => {
                Queue.failCauseUnsafe(queue, Cause.die(error));
              },
              complete: () => {
                Queue.endUnsafe(queue);
              },
            }),
          ),
        ),
        (subscription) => Effect.sync(() => subscription.unsubscribe()),
      ),
    {
      bufferSize: options.bufferSize ?? DEFAULT_BUFFER_SIZE,
      strategy: options.strategy ?? 'sliding',
    },
  );
}

// --- Queue, PubSub, SubscriptionRef ---------------------------------------
//
// All three are cold on the Effect side, so they are `fromStream` in disguise.
// There is deliberately NO automatic two-way bridge between a craft subject and
// a Queue/PubSub: it would loop (echo) and double-buffer.

/** The values taken from a `Queue`, as a craft stream. */
export function fromQueue<A, E>(
  queue: Queue.Dequeue<A, E>,
): CraftStream<A, EffectExceptionMarkers<Exclude<E, Cause.Done>>> {
  return fromStream(Stream.fromQueue(queue)) as never;
}

/** The messages published on a `PubSub`, as a craft stream. */
export function fromPubSub<A>(pubsub: PubSub.PubSub<A>): CraftStream<A, never> {
  return fromStream(Stream.fromPubSub(pubsub)) as never;
}

/**
 * A `SubscriptionRef` as a craft stream: its current value first, then every
 * change (`SubscriptionRef.changes` already starts with the current value).
 */
export function fromSubscriptionRef<A>(
  ref: SubscriptionRef.SubscriptionRef<A>,
): CraftStream<A, never> {
  return fromStream(SubscriptionRef.changes(ref)) as never;
}

// --- Schedule --------------------------------------------------------------

/**
 * A craft schedule as an Effect `Schedule`: each step asks the craft schedule
 * for the delay of the next attempt and stops when it says `done`. The output
 * is the attempt number.
 */
export function toEffectSchedule(
  schedule: CraftTemporalSchedule,
): Schedule.Schedule<number, unknown> {
  return Schedule.fromStep(
    Effect.sync(() => {
      let attempt = 0;
      let startedAt: number | undefined;
      return (now: number, input: unknown) => {
        attempt += 1;
        startedAt ??= now;
        const decision = schedule.next({
          attempt,
          elapsedMs: now - startedAt,
          input,
        });
        return decision.done
          ? Cause.done(attempt)
          : Effect.succeed([attempt, Duration.millis(decision.delayMs)] as [
              number,
              Duration.Duration,
            ]);
      };
    }),
  );
}

/** Raised when an Effect `Schedule` cannot be run synchronously. */
export class CraftScheduleNotPure extends Error {
  constructor() {
    super(
      'This Effect Schedule is not pure: a craft schedule must decide synchronously, but this one suspended or failed.',
    );
    this.name = 'CraftScheduleNotPure';
  }
}

/**
 * An Effect `Schedule` as a craft schedule — for the **pure** ones only.
 * Craft's `CraftTemporalSchedule` decides synchronously, so the Effect schedule
 * is stepped with `runSyncExit`: `fixed`, `spaced`, `exponential`, `recurs` and
 * their pure combinations work; one that suspends (a `Clock` wait, an
 * effectful `while`) raises {@link CraftScheduleNotPure} instead of
 * misbehaving.
 *
 * The Effect schedule is stateful; the adapter restarts it whenever craft asks
 * for attempt 1, so one adapter can serve successive runs.
 */
export function fromEffectSchedule(
  schedule: Schedule.Schedule<unknown, unknown, never, never>,
): CraftTemporalSchedule {
  let step:
    | ((now: number, input: unknown) => Effect.Effect<unknown, unknown>)
    | undefined;

  return {
    next: ({ attempt, elapsedMs, input, error }) => {
      if (attempt <= 1 || !step) {
        step = Effect.runSync(Schedule.toStep(schedule)) as never;
      }
      const exit = Effect.runSyncExit(
        (
          step as (
            now: number,
            input: unknown,
          ) => Effect.Effect<unknown, unknown>
        )(elapsedMs, input ?? error),
      );
      if (Exit.isSuccess(exit)) {
        const [, duration] = exit.value as [unknown, Duration.Duration];
        return { done: false, delayMs: Duration.toMillis(duration) };
      }
      // The pull signals the end of the schedule with a `Done` failure.
      const failure = Cause.findErrorOption(exit.cause);
      if (Option.isSome(failure) && Cause.isDone(failure.value)) {
        return { done: true };
      }
      throw new CraftScheduleNotPure();
    },
  };
}
