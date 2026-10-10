import {
  type RuntimeTemporalAwaitRequest,
  type Subscribable,
  type Unsubscribable,
} from '@craft-ts/core';
import {
  createCraftStream,
  createSink,
  forwardSink,
  STREAM_RUN,
  type AnyCraftStream,
  type CraftStream,
} from '../craft-stream';
import { from } from '../sources-extra';
import { interval } from '../sources-timed';
import { mergeMap } from './flatten';
import { mapTo } from './aggregate';
import { sample } from './group';
import { take } from './limit';

// ---------------------------------------------------------------------------
// Time operators driven by another stream (`audit`, `delayWhen`) and the
// period form of `sample`. The notifier is a craft stream: its dependencies and
// exceptions join the result's `Y`.
// ---------------------------------------------------------------------------

/**
 * Like `auditTime`, but the window's length comes from a stream: the first
 * value opens a window by subscribing `durationSelector(value)`; the window
 * ends when that stream emits (or completes), and the **latest** value is
 * emitted then.
 */
export function audit<A, N, YN>(
  durationSelector: (value: A) => CraftStream<N, YN>,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y | YN>;
export function audit<A>(
  durationSelector: (value: A) => Subscribable<unknown>,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y>;
export function audit(
  durationSelector: (value: never) => unknown,
): <A, Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y> {
  return ((source: AnyCraftStream) =>
    createCraftStream<unknown, unknown>((context, sink, teardown) => {
      let held: { value: unknown } | undefined;
      let window: Unsubscribable | undefined;
      teardown.add(() => window?.unsubscribe());

      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            held = { value };
            if (window) return;
            let opened: AnyCraftStream;
            try {
              opened = from(durationSelector(value as never) as never) as AnyCraftStream;
            } catch (error) {
              sink.error(error);
              return;
            }
            let ended = false;
            const end = () => {
              if (ended) return;
              ended = true;
              window?.unsubscribe();
              window = undefined;
              const emit = held;
              held = undefined;
              if (emit) sink.next(emit.value);
            };
            const subscription = opened[STREAM_RUN](
              context,
              createSink<unknown>(
                {
                  next: end,
                  exception: (exception) => sink.exception(exception),
                  error: (error) => sink.error(error),
                  complete: end,
                },
                () => sink.closed,
              ),
            );
            // A duration that ended synchronously already emitted: do not keep it.
            if (ended) {
              subscription.unsubscribe();
            } else {
              window = subscription;
            }
          },
          complete: () => {
            window?.unsubscribe();
            window = undefined;
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
 * Emits the latest value every `periodMs`, if the source produced a new one
 * since the last emission.
 */
export function sampleTime(
  periodMs: number,
): <A, Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<A, Y | RuntimeTemporalAwaitRequest> {
  return ((source: AnyCraftStream) =>
    source.pipe(sample(interval(periodMs)))) as never;
}

/**
 * Delays each value until the stream `durationSelector(value, index)` emits
 * for the first time. A duration that completes without emitting drops its
 * value. Order is not preserved: durations run concurrently.
 */
export function delayWhen<A, N, YN>(
  durationSelector: (value: A, index: number) => CraftStream<N, YN>,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y | YN>;
export function delayWhen<A>(
  durationSelector: (value: A, index: number) => Subscribable<unknown>,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y>;
export function delayWhen(
  durationSelector: (value: never, index: number) => unknown,
): <A, Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y> {
  return ((source: AnyCraftStream) =>
    source.pipe(
      mergeMap((value: unknown, index: number) =>
        (from(durationSelector(value as never, index) as never) as AnyCraftStream).pipe(
          take(1),
          mapTo(value),
        ),
      ),
    )) as never;
}
