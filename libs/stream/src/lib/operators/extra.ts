import {
  isObservableLike,
  subject,
  type RuntimeTemporalAwaitRequest,
  type Subject,
  type TemporalTaskHandle,
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
import { fromSubscribable } from '../sources';

// ---------------------------------------------------------------------------
// Less common operators, kept apart from the core set.
// ---------------------------------------------------------------------------

/**
 * Starts a timer on the first value, emits the **latest** value when it ends,
 * then waits for the next value to start another. (Unlike `throttle`, a value
 * never goes out at the start of a window.)
 */
export function auditTime(
  windowMs: number,
): <A, Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<A, Y | RuntimeTemporalAwaitRequest> {
  return ((source: AnyCraftStream) =>
    createCraftStream<unknown, unknown>((context, sink, teardown) => {
      let held: { value: unknown } | undefined;
      let handle: TemporalTaskHandle | undefined;
      teardown.add(() => handle?.cancel());

      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            held = { value };
            if (handle) return;
            handle = context.temporal.schedule(
              () => {
                handle = undefined;
                const emit = held;
                held = undefined;
                if (emit) sink.next(emit.value);
              },
              windowMs,
              { kind: 'auditTime', destroyRef: context.destroyRef },
            );
          },
          complete: () => {
            handle?.cancel();
            const emit = held;
            held = undefined;
            if (emit) sink.next(emit.value);
            sink.complete();
          },
        }),
      );
    })) as never;
}

/**
 * Splits the stream into windows of `size` values: emits a hot inner stream,
 * which completes after `size` values. Subscribe to each window as soon as you
 * receive it.
 */
export function windowCount(
  size: number,
): <A, Y>(stream: CraftStream<A, Y>) => CraftStream<CraftStream<A, never>, Y> {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError('windowCount: size must be a positive integer.');
  }
  return ((source: AnyCraftStream) =>
    createCraftStream<unknown, unknown>((context, sink) => {
      let current: Subject<unknown, unknown> | undefined;
      let inWindow = 0;
      const open = () => {
        current = subject<unknown, unknown>();
        inWindow = 0;
        sink.next(fromSubscribable(current as Subject<unknown, never>));
      };

      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            if (!current) open();
            current?.next(value);
            inWindow += 1;
            if (inWindow === size) {
              current?.complete();
              current = undefined;
            }
          },
          exception: (exception) => {
            current?.exception(exception);
            sink.exception(exception);
          },
          error: (error) => {
            current?.error(error);
            sink.error(error);
          },
          complete: () => {
            current?.complete();
            sink.complete();
          },
        }),
      );
    })) as never;
}

/**
 * Collects values into an array that is flushed each time the stream
 * `closingSelector()` returns emits; a new buffer — and a new closing stream —
 * then starts. A non-empty remainder is flushed on completion.
 */
export function bufferWhen<N, YN>(
  closingSelector: () => CraftStream<N, YN>,
): <A, Y>(stream: CraftStream<A, Y>) => CraftStream<A[], Y | YN> {
  return ((source: AnyCraftStream) =>
    createCraftStream<unknown, unknown>((context, sink, teardown) => {
      let values: unknown[] = [];
      let closing: Unsubscribable | undefined;
      teardown.add(() => closing?.unsubscribe());

      const arm = () => {
        closing?.unsubscribe();
        const next = closingSelector() as AnyCraftStream;
        if (!isCraftStream(next)) {
          sink.error(
            new Error(
              'bufferWhen: the closing selector must return a craft stream.',
            ),
          );
          return;
        }
        closing = next[STREAM_RUN](
          context,
          createSink<unknown>(
            {
              next: () => {
                const out = values;
                values = [];
                sink.next(out);
                arm();
              },
              exception: (exception) => sink.exception(exception),
              error: (error) => sink.error(error),
              complete: () => undefined,
            },
            () => sink.closed,
          ),
        );
      };

      arm();
      if (sink.closed) return;
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            values.push(value);
          },
          complete: () => {
            if (values.length > 0) sink.next(values);
            sink.complete();
          },
        }),
      );
    })) as never;
}

/**
 * Recursively projects: every value — from the source **and** from the inner
 * streams — is emitted, then projected again, its inner stream's values
 * feeding back in. The recursion only ends when a projection returns an empty
 * stream, so bound it (`take`, `takeUntil`, or an inner `empty()`).
 *
 * The projection may be a generator (its yields join the type) and return a
 * plain `Subscribable`.
 */
export function expand<A, YB, HY>(
  project: (
    value: A,
    index: number,
  ) => Generator<HY, CraftStream<A, YB>, unknown>,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y | HY | YB>;
export function expand<A, YB>(
  project: (value: A, index: number) => CraftStream<A, YB>,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y | YB>;
export function expand<A>(
  project: (value: A, index: number) => { subscribe(observer: never): unknown },
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y>;
export function expand(
  project: (value: unknown, index: number) => unknown,
): (stream: AnyCraftStream) => AnyCraftStream {
  return (source) =>
    createCraftStream<unknown, unknown>((context, sink, teardown) => {
      const slots = new Set<Teardown>();
      let outerDone = false;
      let index = 0;
      teardown.add(() => {
        for (const slot of [...slots]) slot.unsubscribe();
        slots.clear();
      });
      const completeIfIdle = () => {
        if (outerDone && slots.size === 0) sink.complete();
      };

      const feed = (value: unknown) => {
        sink.next(value);
        if (sink.closed) return;
        const slot = new Teardown();
        slots.add(slot);
        const release = () => {
          if (!slots.delete(slot)) return;
          slot.unsubscribe();
          completeIfIdle();
        };
        slot.add(
          runHandler(
            context,
            () => project(value, index++),
            (outcome) => {
              if (outcome.kind === 'exception') {
                sink.exception(outcome.exception);
                return;
              }
              if (outcome.kind === 'error') {
                sink.error(outcome.error);
                return;
              }
              const inner = outcome.value;
              if (!isObservableLike(inner)) {
                sink.error(
                  new Error('expand: the projection must return a stream.'),
                );
                return;
              }
              const innerSink = createSink<unknown>(
                {
                  next: feed,
                  exception: (exception) => sink.exception(exception),
                  error: (error) => sink.error(error),
                  complete: release,
                },
                () => sink.closed || !slots.has(slot),
              );
              slot.add(
                isCraftStream(inner)
                  ? inner[STREAM_RUN](context, innerSink)
                  : inner.subscribe({
                      next: (v: unknown) => innerSink.next(v),
                      error: (e: unknown) => innerSink.error(e),
                      exception: (e: unknown) => innerSink.exception(e),
                      complete: () => innerSink.complete(),
                    } as never),
              );
            },
          ),
        );
      };

      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: feed,
          complete: () => {
            outerDone = true;
            completeIfIdle();
          },
        }),
      );
    });
}
