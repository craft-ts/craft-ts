import type {
  AnyCraftException,
  CraftGenExceptionMarker,
  CraftPrimitiveGen,
  Subject,
  Subscribable,
  Unsubscribable,
} from '@craft-ts/core';
import {
  captureStreamContext,
  createCraftStream,
  observerToSink,
  STREAM_RUN,
  type AnyCraftStream,
  type CraftStream,
  type StreamContextOptions,
} from './craft-stream';
import { traceStreamRoot } from './stream-trace';

/** Emits `values` in order, then completes. */
export function of<A>(...values: A[]): CraftStream<A, never> {
  return createCraftStream<A, never>((_context, sink) => {
    for (const value of values) {
      if (sink.closed) return;
      sink.next(value);
    }
    sink.complete();
  });
}

/** Completes immediately without emitting. */
export function empty(): CraftStream<never, never> {
  return createCraftStream<never, never>((_context, sink) => {
    sink.complete();
  });
}

/** Terminates immediately with a typed exception. */
export function fail<E extends AnyCraftException>(
  exception: E,
): CraftStream<never, CraftGenExceptionMarker<E>> {
  return createCraftStream<never, CraftGenExceptionMarker<E>>(
    (_context, sink) => {
      sink.exception(exception);
    },
  );
}

/**
 * Wraps anything subscribable — an RxJS `Observable`, a core `Subject`, a
 * `Subscribable` of your own. Each subscription to the stream subscribes to
 * `source`.
 *
 * A core `Subject<T, E>` advertises its declared failure set `E`: it becomes
 * the stream's exception type. Any other subscribable has no typed failures —
 * its `error` stays a defect (an `exception` notification, if it sends one, is
 * still forwarded as an exception).
 */
export function fromSubscribable<A, E extends AnyCraftException>(
  source: Subject<A, E>,
): CraftStream<A, [E] extends [never] ? never : CraftGenExceptionMarker<E>>;
export function fromSubscribable<A>(
  source: Subscribable<A>,
): CraftStream<A, never>;
export function fromSubscribable<A>(
  source: Subscribable<A>,
): CraftStream<A, unknown> {
  return createCraftStream((_context, sink) =>
    source.subscribe({
      next: (value) => sink.next(value),
      error: (error) => sink.error(error),
      exception: (exception: unknown) => sink.exception(exception),
      complete: () => sink.complete(),
    } as Parameters<Subscribable<A>['subscribe']>[0]),
  );
}

type SourceRef = {
  subscribe(callback: (value: any) => void): unknown;
};

type SourceValueOf<Ref> = Ref extends {
  subscribe(callback: (value: infer T) => void): unknown;
}
  ? T
  : never;

type PrimitiveYielded<Ref> =
  CraftPrimitiveGen<Ref> extends Generator<infer Yielded, any, any>
    ? Yielded
    : never;

/**
 * Lifts a `source$` (or its `asReadonly()` view) into a stream. The source's
 * service-dependency metadata travels in the stream's type, so consuming it
 * from a service keeps that dependency tracked.
 */
export function fromSource<Ref extends SourceRef>(
  source: Ref,
): CraftStream<SourceValueOf<Ref>, PrimitiveYielded<Ref>> {
  return createCraftStream((_context, sink) => {
    const subscription = source.subscribe((value: unknown) =>
      sink.next(value as SourceValueOf<Ref>),
    );
    return (subscription as Unsubscribable | undefined)?.unsubscribe
      ? (subscription as Unsubscribable)
      : undefined;
  });
}

/**
 * Exposes a stream as a plain `Subscribable` (e.g. to hand it to an RxJS
 * `from(...)`, or to any API that expects the structural contract). The
 * stream's context is captured from `options`, or from the ambient injection
 * context at this call. Exceptions arrive through `exception` when the
 * observer has it, `error` otherwise.
 */
export function toSubscribable<A, Y>(
  stream: CraftStream<A, Y>,
  options?: StreamContextOptions,
): Subscribable<A> {
  const context = captureStreamContext(options);
  return {
    subscribe: (observer) =>
      traceStreamRoot(context, observerToSink(observer), 'adapter', (sink, ctx) =>
        (stream as AnyCraftStream)[STREAM_RUN](ctx, sink),
      ),
  };
}
