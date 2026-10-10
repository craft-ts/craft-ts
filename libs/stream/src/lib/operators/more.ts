import {
  EmptyStreamError,
  type Subscribable,
  type Unsubscribable,
} from '@craft-ts/core';
import {
  createCraftStream,
  createSink,
  forwardSink,
  isCraftStream,
  STREAM_RUN,
  type AnyCraftStream,
  type CraftStream,
  type StreamValue,
  type StreamYielded,
} from '../craft-stream';
import { combineLatest, merge } from './combine';
import {
  concatMap,
  mergeMap,
  switchMap,
  exhaustMap,
  type FlattenQueueOptions,
  type MergeMapOptions,
} from './flatten';

// ---------------------------------------------------------------------------
// The everyday operators that round out the set: single-value selection, tail
// handling, end/empty handling, flattening of a stream of streams, and the
// `…With` forms of the combination operators.
// ---------------------------------------------------------------------------

type Same = <A, Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y>;

function fromSetup(
  setup: (source: AnyCraftStream) => AnyCraftStream,
): (source: AnyCraftStream) => AnyCraftStream {
  return setup;
}

// --- single value ----------------------------------------------------------

/**
 * Emits the first value (the first one the predicate accepts) and completes. A
 * source that completes without one ends with an `EmptyStreamError` **defect**.
 */
export function first(): Same;
export function first<A>(
  predicate: (value: A, index: number) => boolean,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y>;
export function first(
  predicate?: (value: never, index: number) => boolean,
): Same {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink) => {
      let index = 0;
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            if (!predicate || predicate(value as never, index++)) {
              sink.next(value);
              sink.complete();
            }
          },
          complete: () => sink.error(new EmptyStreamError()),
        }),
      );
    }),
  ) as never;
}

/**
 * Emits the last value (the last one the predicate accepts) once the source
 * completes. An empty source ends with an `EmptyStreamError` **defect**.
 */
export function last(): Same;
export function last<A>(
  predicate: (value: A, index: number) => boolean,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y>;
export function last(
  predicate?: (value: never, index: number) => boolean,
): Same {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink) => {
      let held: { value: unknown } | undefined;
      let index = 0;
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            if (!predicate || predicate(value as never, index++)) {
              held = { value };
            }
          },
          complete: () => {
            if (held) {
              sink.next(held.value);
              sink.complete();
            } else {
              sink.error(new EmptyStreamError());
            }
          },
        }),
      );
    }),
  ) as never;
}

/** Emits the last `count` values once the source completes. */
export function takeLast(count: number): Same {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink) => {
      const tail: unknown[] = [];
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            if (count <= 0) return;
            tail.push(value);
            if (tail.length > count) tail.shift();
          },
          complete: () => {
            for (const value of tail) {
              if (sink.closed) return;
              sink.next(value);
            }
            sink.complete();
          },
        }),
      );
    }),
  ) as never;
}

/**
 * Folds every value and emits the final accumulator once — `seed` itself when
 * the source is empty.
 */
export function reduce<A, B>(
  reducer: (accumulator: B, value: A, index: number) => B,
  seed: B,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<B, Y> {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink) => {
      let accumulator: unknown = seed;
      let index = 0;
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            try {
              accumulator = reducer(accumulator as B, value as A, index++);
            } catch (error) {
              sink.error(error);
            }
          },
          complete: () => {
            sink.next(accumulator);
            sink.complete();
          },
        }),
      );
    }),
  ) as never;
}

// --- dropping, emptiness, ends ------------------------------------------------

/** Drops values while the predicate holds, then lets everything through. */
export function skipWhile<A>(
  predicate: (value: A, index: number) => boolean,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y> {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink) => {
      let skipping = true;
      let index = 0;
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            if (skipping) {
              try {
                skipping = predicate(value as A, index++);
              } catch (error) {
                sink.error(error);
                return;
              }
            }
            if (!skipping) sink.next(value);
          },
        }),
      );
    }),
  ) as never;
}

/**
 * Drops values until `notifier` emits. The notifier is subscribed first; a craft
 * stream notifier contributes its own dependencies and exceptions.
 */
export function skipUntil<N, YN>(
  notifier: CraftStream<N, YN>,
): <A, Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y | YN>;
export function skipUntil(
  notifier: Subscribable<unknown>,
): <A, Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y>;
export function skipUntil(notifier: Subscribable<unknown>): Same {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink, teardown) => {
      let open = false;
      let watching: Unsubscribable | undefined;
      const stopWatching = () => {
        watching?.unsubscribe();
        watching = undefined;
      };
      teardown.add(stopWatching);
      const notifierSink = createSink<unknown>(
        {
          next: () => {
            open = true;
            stopWatching();
          },
          exception: (exception) => sink.exception(exception),
          error: (error) => sink.error(error),
          complete: () => undefined,
        },
        () => sink.closed,
      );
      watching = isCraftStream(notifier)
        ? notifier[STREAM_RUN](context, notifierSink)
        : notifier.subscribe({
            next: () => notifierSink.next(undefined),
            error: (error: unknown) => notifierSink.error(error),
            exception: (exception: unknown) =>
              notifierSink.exception(exception),
          } as Parameters<Subscribable<unknown>['subscribe']>[0]);
      if (open) stopWatching();
      if (sink.closed) return;
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            if (open) sink.next(value);
          },
        }),
      );
    }),
  ) as never;
}

/** Emits `value` if the source completes without emitting anything. */
export function defaultIfEmpty<B>(
  value: B,
): <A, Y>(stream: CraftStream<A, Y>) => CraftStream<A | B, Y> {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink) => {
      let seen = false;
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (item) => {
            seen = true;
            sink.next(item);
          },
          complete: () => {
            if (!seen) sink.next(value);
            sink.complete();
          },
        }),
      );
    }),
  ) as never;
}

/** Drops every value; only the terminal notification gets through. */
export function ignoreElements(): <A, Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<never, Y> {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink) =>
      source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: () => undefined,
        }),
      ),
    ),
  ) as never;
}

/** Emits `values` after the source completes. */
export function endWith<B>(
  ...values: B[]
): <A, Y>(stream: CraftStream<A, Y>) => CraftStream<A | B, Y> {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink) =>
      source[STREAM_RUN](
        context,
        forwardSink(sink, {
          complete: () => {
            for (const value of values) {
              if (sink.closed) return;
              sink.next(value);
            }
            sink.complete();
          },
        }),
      ),
    ),
  ) as never;
}

/**
 * Drops values already seen (by identity, or by `keySelector`). The set of seen
 * keys grows with the number of distinct values: bound the stream it is applied
 * to when that matters.
 */
export function distinct(): Same;
export function distinct<A, K>(
  keySelector: (value: A) => K,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y>;
export function distinct(keySelector?: (value: never) => unknown): Same {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink) => {
      const seen = new Set<unknown>();
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            let key: unknown;
            try {
              key = keySelector ? keySelector(value as never) : value;
            } catch (error) {
              sink.error(error);
              return;
            }
            if (seen.has(key)) return;
            seen.add(key);
            sink.next(value);
          },
        }),
      );
    }),
  ) as never;
}

/**
 * Runs `callback` when the stream ends — completion, exception, defect or
 * unsubscription alike — after the terminal notification has been delivered.
 */
export function finalize(callback: () => void): Same {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink, teardown) => {
      teardown.add(callback);
      return source[STREAM_RUN](context, sink);
    }),
  ) as never;
}

// --- a stream of streams --------------------------------------------------------

type StreamOfStreams<B, YB, Y> = CraftStream<CraftStream<B, YB>, Y>;

/** `switchMap` of the identity: for a stream of streams. */
export function switchAll(): <B, YB, Y>(
  stream: StreamOfStreams<B, YB, Y>,
) => CraftStream<B, Y | YB> {
  return switchMap((inner: AnyCraftStream) => inner) as never;
}

/** `exhaustMap` of the identity: for a stream of streams. */
export function exhaustAll(): <B, YB, Y>(
  stream: StreamOfStreams<B, YB, Y>,
) => CraftStream<B, Y | YB> {
  return exhaustMap((inner: AnyCraftStream) => inner) as never;
}

/** `concatMap` of the identity: for a stream of streams. */
export function concatAll(
  options?: FlattenQueueOptions,
): <B, YB, Y>(stream: StreamOfStreams<B, YB, Y>) => CraftStream<B, Y | YB> {
  return concatMap((inner: AnyCraftStream) => inner, options) as never;
}

/** `mergeMap` of the identity: for a stream of streams. */
export function mergeAll(
  options?: MergeMapOptions,
): <B, YB, Y>(stream: StreamOfStreams<B, YB, Y>) => CraftStream<B, Y | YB> {
  return mergeMap((inner: AnyCraftStream) => inner, options) as never;
}

// --- concatenation and the `…With` forms ------------------------------------------

/**
 * Runs the streams one after the other: each is subscribed when the previous
 * one completes. An exception or defect in any of them ends the result.
 */
export function concat<const S extends readonly AnyCraftStream[]>(
  ...streams: S
): CraftStream<StreamValue<S[number]>, StreamYielded<S[number]>> {
  return createCraftStream<unknown, unknown>((context, sink, teardown) => {
    let position = 0;
    let generation = 0;
    let current: Unsubscribable | undefined;
    teardown.add(() => {
      generation += 1;
      current?.unsubscribe();
    });

    const advance = () => {
      if (position >= streams.length) {
        sink.complete();
        return;
      }
      const mine = ++generation;
      const subscription = streams[position++][STREAM_RUN](
        context,
        createSink<unknown>(
          {
            next: (value) => sink.next(value),
            exception: (exception) => sink.exception(exception),
            error: (error) => sink.error(error),
            complete: advance,
          },
          () => sink.closed,
        ),
      );
      if (generation === mine) current = subscription;
      else subscription.unsubscribe();
    };

    advance();
  }) as never;
}

/** `source`, then each of `others` in turn. */
export function concatWith<const S extends readonly AnyCraftStream[]>(
  ...others: S
): <A, Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<A | StreamValue<S[number]>, Y | StreamYielded<S[number]>> {
  return ((source: AnyCraftStream) => concat(source, ...others)) as never;
}

/** `source` merged with each of `others`. */
export function mergeWith<const S extends readonly AnyCraftStream[]>(
  ...others: S
): <A, Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<A | StreamValue<S[number]>, Y | StreamYielded<S[number]>> {
  return ((source: AnyCraftStream) => merge(source, ...others)) as never;
}

/** `source` combined with the latest of each of `others`, as a tuple. */
export function combineLatestWith<const S extends readonly AnyCraftStream[]>(
  ...others: S
): <A, Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<
  [A, ...{ -readonly [K in keyof S]: StreamValue<S[K]> }],
  Y | StreamYielded<S[number]>
> {
  return ((source: AnyCraftStream) =>
    combineLatest([source, ...others])) as never;
}
