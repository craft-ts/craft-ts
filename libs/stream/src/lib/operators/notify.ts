import type {
  MarkerFor,
  RuntimeTemporalAwaitRequest,
  StripGenExceptionMarkers,
  TemporalTaskHandle,
} from '@craft-ts/core';
import {
  createCraftStream,
  forwardSink,
  STREAM_RUN,
  type AnyCraftStream,
  type CraftStream,
  type StreamExceptions,
} from '../craft-stream';

// ---------------------------------------------------------------------------
// Notifications as values (`materialize` / `dematerialize`) and the two
// operators that move work onto the temporal runtime (`observeOn` /
// `subscribeOn`) — the craft counterpart of RxJS schedulers: there is exactly
// one scheduler, the temporal runtime, so there is no scheduler argument.
// ---------------------------------------------------------------------------

/**
 * A stream's notifications reified as values. `kind` follows RxJS where it can:
 * `'N'` next, `'C'` complete, `'E'` a **defect** (RxJS's error) — plus `'X'`, a
 * **typed exception**, which RxJS has no notion of.
 */
export type StreamNotification<A, E = never> =
  | { readonly kind: 'N'; readonly value: A }
  | { readonly kind: 'X'; readonly exception: E }
  | { readonly kind: 'E'; readonly error: unknown }
  | { readonly kind: 'C' };

/**
 * Turns every notification into a value, then completes. Typed exceptions stop
 * being exceptions: they leave the stream's `Y` and travel in the `'X'`
 * notifications instead, so nothing the result raises is left to catch.
 */
export function materialize(): <A, Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<
  StreamNotification<A, StreamExceptions<Y>>,
  StripGenExceptionMarkers<Y>
> {
  return ((source: AnyCraftStream) =>
    createCraftStream<unknown, unknown>((context, sink) =>
      source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => sink.next({ kind: 'N', value }),
          exception: (exception) => {
            sink.next({ kind: 'X', exception });
            sink.complete();
          },
          error: (error) => {
            sink.next({ kind: 'E', error });
            sink.complete();
          },
          complete: () => {
            sink.next({ kind: 'C' });
            sink.complete();
          },
        }),
      ),
    )) as never;
}

/** The inverse of {@link materialize}: notifications become real ones again. */
export function dematerialize(): <N extends StreamNotification<any, any>, Y>(
  stream: CraftStream<N, Y>,
) => CraftStream<
  Extract<N, { kind: 'N' }>['value'],
  Y | MarkerFor<Extract<Extract<N, { kind: 'X' }>['exception'], object>>
> {
  return ((source: AnyCraftStream) =>
    createCraftStream<unknown, unknown>((context, sink) =>
      source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (notification) => {
            const item = notification as StreamNotification<unknown, unknown>;
            if (item.kind === 'N') sink.next(item.value);
            else if (item.kind === 'X') sink.exception(item.exception);
            else if (item.kind === 'E') sink.error(item.error);
            else sink.complete();
          },
        }),
      ),
    )) as never;
}

/**
 * Re-delivers every notification — values, exceptions, defects and completion —
 * `delayMs` later, on the temporal runtime, in order. With the default 0 it is
 * a hop to the next turn of the clock.
 */
export function observeOn(
  delayMs = 0,
): <A, Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<A, Y | RuntimeTemporalAwaitRequest> {
  return ((source: AnyCraftStream) =>
    createCraftStream<unknown, unknown>((context, sink, teardown) => {
      const handles = new Set<TemporalTaskHandle>();
      teardown.add(() => {
        for (const handle of handles) handle.cancel();
        handles.clear();
      });
      const later = (deliver: () => void) => {
        const handle: TemporalTaskHandle = context.temporal.schedule(
          () => {
            handles.delete(handle);
            deliver();
          },
          delayMs,
          { kind: 'observeOn', destroyRef: context.destroyRef },
        );
        handles.add(handle);
      };

      return source[STREAM_RUN](context, {
        get closed() {
          return sink.closed;
        },
        next: (value) => later(() => sink.next(value)),
        exception: (exception) => later(() => sink.exception(exception)),
        error: (error) => later(() => sink.error(error)),
        complete: () => later(() => sink.complete()),
      });
    })) as never;
}

/**
 * Subscribes to the source `delayMs` later, on the temporal runtime (default 0:
 * the next turn of the clock) instead of synchronously.
 */
export function subscribeOn(
  delayMs = 0,
): <A, Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<A, Y | RuntimeTemporalAwaitRequest> {
  return ((source: AnyCraftStream) =>
    createCraftStream<unknown, unknown>((context, sink, teardown) => {
      const handle = context.temporal.schedule(
        () => teardown.add(source[STREAM_RUN](context, sink)),
        delayMs,
        { kind: 'subscribeOn', destroyRef: context.destroyRef },
      );
      teardown.add(() => handle.cancel());
    })) as never;
}
