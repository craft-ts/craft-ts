import type { RuntimeTemporalAwaitRequest } from '@craft-ts/core';
import {
  createCraftStream,
  createSink,
  forwardSink,
  isCraftStream,
  STREAM_RUN,
  type AnyCraftStream,
  type CraftStream,
} from '../craft-stream';

// ---------------------------------------------------------------------------
// Grouping values into arrays. A buffer holds values only until its boundary
// (a count, a time slice, a notifier), and each of them is explicit — there is
// no unbounded accumulation hiding behind a name.
// ---------------------------------------------------------------------------

/**
 * Collects values and emits them as an array each time `closing` emits. A
 * non-empty remainder is flushed on completion. The notifier's `Y` joins the
 * stream's.
 */
export function buffer<N, YN>(
  closing: CraftStream<N, YN>,
): <A, Y>(stream: CraftStream<A, Y>) => CraftStream<A[], Y | YN> {
  return ((source: AnyCraftStream) =>
    createCraftStream<unknown, unknown>((context, sink, teardown) => {
      if (!isCraftStream(closing)) {
        sink.error(
          new Error('buffer: the closing notifier must be a craft stream.'),
        );
        return;
      }
      let values: unknown[] = [];
      const flush = () => {
        const out = values;
        values = [];
        sink.next(out);
      };
      teardown.add(
        (closing as AnyCraftStream)[STREAM_RUN](
          context,
          createSink<unknown>(
            {
              next: flush,
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
            values.push(value);
          },
          complete: () => {
            if (values.length > 0) flush();
            sink.complete();
          },
        }),
      );
    })) as never;
}

/** Emits arrays of `size` values (the last one may be shorter). */
export function bufferCount(
  size: number,
): <A, Y>(stream: CraftStream<A, Y>) => CraftStream<A[], Y> {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError('bufferCount: size must be a positive integer.');
  }
  return ((source: AnyCraftStream) =>
    createCraftStream<unknown, unknown>((context, sink) => {
      let values: unknown[] = [];
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            values.push(value);
            if (values.length === size) {
              const out = values;
              values = [];
              sink.next(out);
            }
          },
          complete: () => {
            if (values.length > 0) sink.next(values);
            sink.complete();
          },
        }),
      );
    })) as never;
}

/** Emits the values received in each `windowMs` slice (empty slices are skipped). */
export function bufferTime(
  windowMs: number,
): <A, Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<A[], Y | RuntimeTemporalAwaitRequest> {
  return ((source: AnyCraftStream) =>
    createCraftStream<unknown, unknown>((context, sink, teardown) => {
      let values: unknown[] = [];
      let stopped = false;
      let handle: { cancel(): boolean } | undefined;
      teardown.add(() => {
        stopped = true;
        handle?.cancel();
      });

      const tick = () => {
        if (stopped) return;
        if (values.length > 0) {
          const out = values;
          values = [];
          sink.next(out);
        }
        arm();
      };
      const arm = () => {
        if (stopped) return;
        handle = context.temporal.schedule(tick, windowMs, {
          kind: 'bufferTime',
          destroyRef: context.destroyRef,
        });
      };
      arm();

      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            values.push(value);
          },
          complete: () => {
            stopped = true;
            handle?.cancel();
            if (values.length > 0) sink.next(values);
            sink.complete();
          },
        }),
      );
    })) as never;
}
