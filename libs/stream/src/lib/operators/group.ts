import { subject, type Subject } from '@craft-ts/core';
import {
  createCraftStream,
  createSink,
  forwardSink,
  STREAM_RUN,
  type AnyCraftStream,
  type CraftStream,
} from '../craft-stream';
import { fromSubscribable } from '../sources';

// ---------------------------------------------------------------------------
// Operators that look at values in relation to each other: neighbours
// (`pairwise`), a sampling clock (`sample`), and the ones that hand out inner
// streams (`groupBy`, `window`).
//
// The inner streams are HOT: they carry only what arrives after they were
// handed out, so subscribe to a group/window as soon as you receive it.
// ---------------------------------------------------------------------------

/** Emits `[previous, current]` for every value after the first. */
export function pairwise(): <A, Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<[A, A], Y> {
  return ((source: AnyCraftStream) =>
    createCraftStream<unknown, unknown>((context, sink) => {
      let has = false;
      let previous: unknown;
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            if (has) sink.next([previous, value]);
            has = true;
            previous = value;
          },
        }),
      );
    })) as never;
}

/**
 * Emits the latest source value each time `notifier` emits — and only if the
 * source produced a new one since the last emission.
 */
export function sample<N, YN>(
  notifier: CraftStream<N, YN>,
): <A, Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y | YN> {
  return ((source: AnyCraftStream) =>
    createCraftStream<unknown, unknown>((context, sink, teardown) => {
      let held: { value: unknown } | undefined;
      teardown.add(
        (notifier as AnyCraftStream)[STREAM_RUN](
          context,
          createSink<unknown>(
            {
              next: () => {
                const emit = held;
                held = undefined;
                if (emit) sink.next(emit.value);
              },
              exception: (exception) => sink.exception(exception),
              error: (error) => sink.error(error),
              complete: () => undefined,
            },
            () => sink.closed,
          ),
        ),
      );
      if (sink.closed) return;
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            held = { value };
          },
        }),
      );
    })) as never;
}

/** An inner stream handed out by {@link groupBy}, tagged with its key. */
export type GroupedStream<K, A> = CraftStream<A, never> & {
  readonly key: K;
};

/**
 * Splits the stream by key: emits a {@link GroupedStream} the first time a key
 * is seen; every later value of that key goes into it. Groups end with the
 * source (completion, exception and defect all reach them).
 */
export function groupBy<A, K>(
  key: (value: A) => K,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<GroupedStream<K, A>, Y> {
  return ((source: AnyCraftStream) =>
    createCraftStream<unknown, unknown>((context, sink) => {
      const groups = new Map<K, Subject<A, unknown>>();
      const each = (fn: (group: Subject<A, unknown>) => void) => {
        for (const group of [...groups.values()]) fn(group);
      };

      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            let k: K;
            try {
              k = key(value as A);
            } catch (error) {
              sink.error(error);
              return;
            }
            let group = groups.get(k);
            if (!group) {
              group = subject<A, unknown>();
              groups.set(k, group);
              sink.next(
                Object.assign(fromSubscribable(group as Subject<A, never>), {
                  key: k,
                }),
              );
            }
            group.next(value as A);
          },
          exception: (exception) => {
            each((group) => group.exception(exception));
            sink.exception(exception);
          },
          error: (error) => {
            each((group) => group.error(error));
            sink.error(error);
          },
          complete: () => {
            each((group) => group.complete());
            sink.complete();
          },
        }),
      );
    })) as never;
}

/**
 * Splits the stream into windows: emits a new inner stream each time `opening`
 * emits (and one at the start); the previous window completes. Like
 * {@link groupBy}, windows are hot.
 */
export function window<N, YN>(
  opening: CraftStream<N, YN>,
): <A, Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<CraftStream<A, never>, Y | YN> {
  return ((source: AnyCraftStream) =>
    createCraftStream<unknown, unknown>((context, sink, teardown) => {
      let current: Subject<unknown, unknown> | undefined;
      const open = () => {
        current?.complete();
        current = subject<unknown, unknown>();
        sink.next(fromSubscribable(current as Subject<unknown, never>));
      };
      const endWindows = (fn: (window: Subject<unknown, unknown>) => void) => {
        if (current) fn(current);
      };

      open();
      teardown.add(
        (opening as AnyCraftStream)[STREAM_RUN](
          context,
          createSink<unknown>(
            {
              next: open,
              exception: (exception) => {
                endWindows((w) => w.exception(exception));
                sink.exception(exception);
              },
              error: (error) => {
                endWindows((w) => w.error(error));
                sink.error(error);
              },
              complete: () => undefined,
            },
            () => sink.closed,
          ),
        ),
      );
      if (sink.closed) return;

      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => current?.next(value),
          exception: (exception) => {
            endWindows((w) => w.exception(exception));
            sink.exception(exception);
          },
          error: (error) => {
            endWindows((w) => w.error(error));
            sink.error(error);
          },
          complete: () => {
            endWindows((w) => w.complete());
            sink.complete();
          },
        }),
      );
    })) as never;
}
