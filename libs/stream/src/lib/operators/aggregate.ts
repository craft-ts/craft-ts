import { EmptyStreamError } from '@craft-ts/core';
import {
  createCraftStream,
  forwardSink,
  STREAM_RUN,
  type AnyCraftStream,
  type CraftStream,
} from '../craft-stream';

// ---------------------------------------------------------------------------
// Aggregates, emptiness checks and single-value selection. Their predicates and
// comparers are plain functions (like `first`/`reduce`): a throw ends the
// stream with a defect. A stream that cannot give a value says so with a typed
// DEFECT (`EmptyStreamError`, `StreamSequenceError`, `StreamOutOfRangeError`),
// never with a silent hang.
// ---------------------------------------------------------------------------

/** `single` found more than one matching value. */
export class StreamSequenceError extends Error {
  constructor() {
    super('The stream emitted more than one matching value.');
    this.name = 'StreamSequenceError';
  }
}

/** `elementAt` was asked for an index the stream never reached. */
export class StreamOutOfRangeError extends Error {
  constructor(index: number) {
    super(`The stream completed before reaching index ${index}.`);
    this.name = 'StreamOutOfRangeError';
  }
}

type Same = <A, Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y>;

function fromSetup(
  setup: (source: AnyCraftStream) => AnyCraftStream,
): (source: AnyCraftStream) => AnyCraftStream {
  return setup;
}

/** Runs `step`; a throw ends the stream with a defect instead of escaping. */
function guarded(
  sink: { error(error: unknown): void },
  step: () => void,
): void {
  try {
    step();
  } catch (error) {
    sink.error(error);
  }
}

// --- aggregates ---------------------------------------------------------------

/** Emits how many values (the predicate accepts) the source emitted, once it completes. */
export function count<A>(
  predicate?: (value: A, index: number) => boolean,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<number, Y> {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink) => {
      let total = 0;
      let index = 0;
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) =>
            guarded(sink, () => {
              if (!predicate || predicate(value as A, index)) total += 1;
              index += 1;
            }),
          complete: () => {
            sink.next(total);
            sink.complete();
          },
        }),
      );
    }),
  ) as never;
}

function extremum(
  pick: (comparison: number) => boolean,
  comparer?: (a: never, b: never) => number,
): Same {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink) => {
      let held: { value: unknown } | undefined;
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) =>
            guarded(sink, () => {
              if (!held) {
                held = { value };
                return;
              }
              const comparison = comparer
                ? comparer(value as never, held.value as never)
                : (value as number) < (held.value as number)
                  ? -1
                  : (value as number) > (held.value as number)
                    ? 1
                    : 0;
              if (pick(comparison)) held = { value };
            }),
          complete: () => {
            if (held) sink.next(held.value);
            sink.complete();
          },
        }),
      );
    }),
  ) as never;
}

/** Emits the smallest value once the source completes (nothing if it was empty). */
export function min<A>(
  comparer?: (a: A, b: A) => number,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y> {
  return extremum((comparison) => comparison < 0, comparer) as never;
}

/** Emits the largest value once the source completes (nothing if it was empty). */
export function max<A>(
  comparer?: (a: A, b: A) => number,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y> {
  return extremum((comparison) => comparison > 0, comparer) as never;
}

// --- emptiness and predicates ----------------------------------------------------

/** Emits `true` if every value satisfies the predicate — `false` at the first that does not. */
export function every<A>(
  predicate: (value: A, index: number) => boolean,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<boolean, Y> {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink) => {
      let index = 0;
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) =>
            guarded(sink, () => {
              if (!predicate(value as A, index++)) {
                sink.next(false);
                sink.complete();
              }
            }),
          complete: () => {
            sink.next(true);
            sink.complete();
          },
        }),
      );
    }),
  ) as never;
}

/** Emits `true` if the source completes without a value, `false` at the first one. */
export function isEmpty(): <A, Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<boolean, Y> {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink) =>
      source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: () => {
            sink.next(false);
            sink.complete();
          },
          complete: () => {
            sink.next(true);
            sink.complete();
          },
        }),
      ),
    ),
  ) as never;
}

/** Emits the first value the predicate accepts, or `undefined` if none does. */
export function find<A, S extends A>(
  predicate: (value: A, index: number) => value is S,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<S | undefined, Y>;
export function find<A>(
  predicate: (value: A, index: number) => boolean,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A | undefined, Y>;
export function find(
  predicate: (value: never, index: number) => boolean,
): Same {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink) => {
      let index = 0;
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) =>
            guarded(sink, () => {
              if (predicate(value as never, index++)) {
                sink.next(value);
                sink.complete();
              }
            }),
          complete: () => {
            sink.next(undefined);
            sink.complete();
          },
        }),
      );
    }),
  ) as never;
}

/** Emits the index of the first value the predicate accepts, or `-1`. */
export function findIndex<A>(
  predicate: (value: A, index: number) => boolean,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<number, Y> {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink) => {
      let index = 0;
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) =>
            guarded(sink, () => {
              const at = index++;
              if (predicate(value as A, at)) {
                sink.next(at);
                sink.complete();
              }
            }),
          complete: () => {
            sink.next(-1);
            sink.complete();
          },
        }),
      );
    }),
  ) as never;
}

/**
 * Emits the one value (the one the predicate accepts) — none is an
 * `EmptyStreamError` defect, more than one a `StreamSequenceError` defect.
 */
export function single(): Same;
export function single<A>(
  predicate: (value: A, index: number) => boolean,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y>;
export function single(
  predicate?: (value: never, index: number) => boolean,
): Same {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink) => {
      let held: { value: unknown } | undefined;
      let index = 0;
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) =>
            guarded(sink, () => {
              if (predicate && !predicate(value as never, index++)) return;
              if (held) {
                sink.error(new StreamSequenceError());
                return;
              }
              held = { value };
            }),
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

/**
 * Emits the value at `index` and completes. When the source ends first, the
 * given default is emitted — without one, a `StreamOutOfRangeError` defect.
 */
export function elementAt<A>(
  index: number,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y>;
export function elementAt<A, B>(
  index: number,
  defaultValue: B,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A | B, Y>;
export function elementAt(index: number, ...rest: [unknown?]): Same {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink) => {
      let position = 0;
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            if (position++ === index) {
              sink.next(value);
              sink.complete();
            }
          },
          complete: () => {
            if (rest.length > 0) {
              sink.next(rest[0]);
              sink.complete();
            } else {
              sink.error(new StreamOutOfRangeError(index));
            }
          },
        }),
      );
    }),
  ) as never;
}

/** Ends with a defect (`EmptyStreamError` by default) if the source completes without a value. */
export function throwIfEmpty(errorFactory?: () => unknown): Same {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink) => {
      let seen = false;
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            seen = true;
            sink.next(value);
          },
          complete: () => {
            if (seen) {
              sink.complete();
              return;
            }
            guarded(sink, () =>
              sink.error(
                errorFactory ? errorFactory() : new EmptyStreamError(),
              ),
            );
          },
        }),
      );
    }),
  ) as never;
}

// --- shaping values ----------------------------------------------------------------

/** Drops the last `count` values (held back until the source completes). */
export function skipLast(count: number): Same {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink) => {
      const held: unknown[] = [];
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            held.push(value);
            if (held.length > count) sink.next(held.shift());
          },
        }),
      );
    }),
  ) as never;
}

/** Replaces every value by `value`. */
export function mapTo<B>(
  value: B,
): <A, Y>(stream: CraftStream<A, Y>) => CraftStream<B, Y> {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink) =>
      source[STREAM_RUN](
        context,
        forwardSink(sink, { next: () => sink.next(value) }),
      ),
    ),
  ) as never;
}

/** Drops a value whose `key` property equals the previous one's. */
export function distinctUntilKeyChanged<A, K extends keyof A>(
  key: K,
  compare: (previous: A[K], current: A[K]) => boolean = Object.is,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y> {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink) => {
      let previous: { value: A[K] } | undefined;
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) =>
            guarded(sink, () => {
              const current = (value as A)[key];
              if (previous && compare(previous.value, current)) return;
              previous = { value: current };
              sink.next(value);
            }),
        }),
      );
    }),
  ) as never;
}

/** Pairs each value with the civil time (`dateNow`) it arrived at. */
export function timestamp(): <A, Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<{ value: A; timestamp: number }, Y> {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink) =>
      source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) =>
            sink.next({ value, timestamp: context.temporal.dateNow() }),
        }),
      ),
    ),
  ) as never;
}

/** Pairs each value with the monotonic time elapsed since the previous one (or the subscription). */
export function timeInterval(): <A, Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<{ value: A; interval: number }, Y> {
  return fromSetup((source) =>
    createCraftStream<unknown, unknown>((context, sink) => {
      let last = context.temporal.now();
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            const now = context.temporal.now();
            const interval = now - last;
            last = now;
            sink.next({ value, interval });
          },
        }),
      );
    }),
  ) as never;
}
