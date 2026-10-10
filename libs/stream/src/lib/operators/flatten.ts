import {
  isObservableLike,
  type Subscribable,
  type Unsubscribable,
} from '@craft-ts/core';
import {
  createCraftStream,
  createSink,
  forwardSink,
  isCraftStream,
  STREAM_RUN,
  Teardown,
  type AnyCraftStream,
  type CraftStream,
} from '../craft-stream';
import { runHandler } from '../internal/run-handler';

// ---------------------------------------------------------------------------
// Flattening: each outer value is projected to an inner stream, whose values
// are flattened into one. The four operators differ only in what happens when
// an outer value arrives while inner streams are still running:
//
//   switchMap  — cancel the running ones, start the new one;
//   exhaustMap — ignore the new value;
//   concatMap  — queue it, run one at a time;
//   mergeMap   — run it at once (up to `concurrency`, queueing beyond).
//
// The inner streams' dependencies and exceptions join the outer `Y`. The
// projection may be a craft generator, whose own `yield*`s join it too.
//
// Nothing is buffered implicitly: a queue only exists for `concatMap` and a
// bounded `mergeMap`, and `buffer` / `overflow` bound it explicitly.
// ---------------------------------------------------------------------------

/** A queued outer value was dropped or refused because `buffer` is full. */
export class StreamBufferOverflowError extends Error {
  constructor(buffer: number) {
    super(`The flattening queue exceeded its buffer of ${buffer} value(s).`);
    this.name = 'StreamBufferOverflowError';
  }
}

export type FlattenQueueOptions = {
  /** Maximum number of outer values waiting for a free slot (default: unbounded). */
  buffer?: number;
  /**
   * What happens to a value that finds the queue full: terminate with a defect
   * (`'error'`, default), drop it (`'drop-newest'`), or drop the oldest queued
   * one (`'drop-oldest'`).
   */
  overflow?: 'error' | 'drop-newest' | 'drop-oldest';
};

export type MergeMapOptions = FlattenQueueOptions & {
  /** Maximum inner streams running at once (default: unbounded). */
  concurrency?: number;
};

type FlattenConfig = {
  mode: 'switch' | 'exhaust' | 'queue';
  concurrency: number;
  buffer: number;
  overflow: 'error' | 'drop-newest' | 'drop-oldest';
};

type InnerLike = CraftStream<any, any> | Subscribable<any>;

function flatten(
  source: AnyCraftStream,
  project: (value: unknown, index: number) => unknown,
  config: FlattenConfig,
): CraftStream<any, any> {
  return createCraftStream<unknown, unknown>((context, sink, teardown) => {
    const slots = new Set<Teardown>();
    const queue: Array<{ value: unknown; index: number }> = [];
    let outerDone = false;
    let index = 0;

    teardown.add(() => {
      for (const slot of [...slots]) slot.unsubscribe();
      slots.clear();
      queue.length = 0;
    });

    const completeIfIdle = () => {
      if (outerDone && slots.size === 0 && queue.length === 0) sink.complete();
    };

    const drain = () => {
      while (queue.length > 0 && slots.size < config.concurrency) {
        const next = queue.shift() as { value: unknown; index: number };
        start(next.value, next.index);
      }
    };

    const start = (value: unknown, position: number) => {
      const slot = new Teardown();
      slots.add(slot);
      const release = () => {
        if (!slots.delete(slot)) return;
        slot.unsubscribe();
        drain();
        completeIfIdle();
      };

      slot.add(
        runHandler(
          context,
          () => project(value, position),
          (outcome) => {
            if (outcome.kind === 'exception') {
              sink.exception(outcome.exception);
              return;
            }
            if (outcome.kind === 'error') {
              sink.error(outcome.error);
              return;
            }
            const inner = outcome.value as InnerLike;
            if (!isObservableLike(inner)) {
              sink.error(
                new Error(
                  'The projection of a flattening operator must return a stream.',
                ),
              );
              return;
            }
            const innerSink = createSink<unknown>(
              {
                next: (innerValue) => sink.next(innerValue),
                exception: (exception) => sink.exception(exception),
                error: (error) => sink.error(error),
                complete: release,
              },
              () => sink.closed || !slots.has(slot),
            );
            slot.add(
              isCraftStream(inner)
                ? inner[STREAM_RUN](context, innerSink)
                : subscribeLike(inner, innerSink),
            );
          },
        ),
      );
    };

    const enqueue = (value: unknown, position: number) => {
      if (queue.length >= config.buffer) {
        if (config.overflow === 'error') {
          sink.error(new StreamBufferOverflowError(config.buffer));
          return;
        }
        if (config.overflow === 'drop-newest') return;
        queue.shift();
      }
      queue.push({ value, index: position });
    };

    return source[STREAM_RUN](
      context,
      forwardSink(sink, {
        next: (value) => {
          const position = index++;
          if (config.mode === 'switch') {
            for (const slot of [...slots]) {
              slots.delete(slot);
              slot.unsubscribe();
            }
            start(value, position);
          } else if (config.mode === 'exhaust') {
            if (slots.size === 0) start(value, position);
          } else if (slots.size < config.concurrency) {
            start(value, position);
          } else {
            enqueue(value, position);
          }
        },
        complete: () => {
          outerDone = true;
          completeIfIdle();
        },
      }),
    );
  });
}

/** Subscribes a plain `Subscribable` inner stream to a sink. */
function subscribeLike(
  inner: Subscribable<unknown>,
  sink: ReturnType<typeof createSink<unknown>>,
): Unsubscribable {
  return inner.subscribe({
    next: (value) => sink.next(value),
    error: (error) => sink.error(error),
    exception: (exception: unknown) => sink.exception(exception),
    complete: () => sink.complete(),
  } as Parameters<Subscribable<unknown>['subscribe']>[0]);
}

/** The overloads shared by the four flattening operators. */
export interface FlattenOperator<Options> {
  /** The projection may be a generator: its yields join the stream's type. */
  <A, B, YB, HY>(
    project: (
      value: A,
      index: number,
    ) => Generator<HY, CraftStream<B, YB>, unknown>,
    options?: Options,
  ): <Y>(stream: CraftStream<A, Y>) => CraftStream<B, Y | HY | YB>;
  <A, B, YB>(
    project: (value: A, index: number) => CraftStream<B, YB>,
    options?: Options,
  ): <Y>(stream: CraftStream<A, Y>) => CraftStream<B, Y | YB>;
  /** A plain `Subscribable` (an RxJS Observable, a core subject…) carries no `Y`. */
  <A, B>(
    project: (value: A, index: number) => Subscribable<B>,
    options?: Options,
  ): <Y>(stream: CraftStream<A, Y>) => CraftStream<B, Y>;
}

const unbounded = Number.POSITIVE_INFINITY;

function queueConfig(
  concurrency: number,
  options: FlattenQueueOptions = {},
): FlattenConfig {
  return {
    mode: 'queue',
    concurrency,
    buffer: options.buffer ?? unbounded,
    overflow: options.overflow ?? 'error',
  };
}

function operator<Options>(
  configure: (options: Options | undefined) => FlattenConfig,
): FlattenOperator<Options> {
  return ((
      project: (value: unknown, index: number) => unknown,
      options?: Options,
    ) =>
    (source: AnyCraftStream) =>
      flatten(source, project, configure(options))) as FlattenOperator<Options>;
}

/** Cancels the running inner stream when a new outer value arrives. */
export const switchMap: FlattenOperator<never> = operator(() => ({
  mode: 'switch',
  concurrency: 1,
  buffer: 0,
  overflow: 'error',
}));

/** Ignores outer values that arrive while an inner stream is running. */
export const exhaustMap: FlattenOperator<never> = operator(() => ({
  mode: 'exhaust',
  concurrency: 1,
  buffer: 0,
  overflow: 'error',
}));

/**
 * Runs inner streams one after the other, in arrival order. Waiting values are
 * queued — unbounded unless `buffer` bounds it (`overflow` says what gives).
 */
export const concatMap: FlattenOperator<FlattenQueueOptions> = operator(
  (options) => queueConfig(1, options),
);

/**
 * Runs inner streams concurrently (up to `concurrency`, unbounded by default).
 * Beyond `concurrency`, values queue exactly as in {@link concatMap}.
 */
export const mergeMap: FlattenOperator<MergeMapOptions> = operator((options) =>
  queueConfig(options?.concurrency ?? unbounded, options),
);
