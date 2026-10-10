import {
  DestroyRef,
  ɵinject as inject,
  type Subscribable,
} from '@craft-ts/core';
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
// Operators that select, bound or seed a stream. None of them runs a handler,
// so none touches `Y`: the stream's dependencies and exceptions pass through.
// (`takeUntil` is the one exception — its notifier brings its own `Y`.)
// ---------------------------------------------------------------------------

/** Completes after `count` values. `count <= 0` completes without subscribing. */
export function take(
  count: number,
): <A, Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y> {
  return (source: AnyCraftStream) =>
    createCraftStream((context, sink) => {
      if (count <= 0) {
        sink.complete();
        return;
      }
      let taken = 0;
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            taken += 1;
            sink.next(value);
            if (taken >= count) sink.complete();
          },
        }),
      );
    }) as never;
}

/** Drops the first `count` values. */
export function skip(
  count: number,
): <A, Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y> {
  return (source: AnyCraftStream) =>
    createCraftStream((context, sink) => {
      let seen = 0;
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            seen += 1;
            if (seen > count) sink.next(value);
          },
        }),
      );
    }) as never;
}

/** Emits while the predicate holds, then completes. */
export function takeWhile<A>(
  predicate: (value: A, index: number) => boolean,
  options: { inclusive?: boolean } = {},
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y> {
  return (source: AnyCraftStream) =>
    createCraftStream((context, sink) => {
      let index = 0;
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            let holds: boolean;
            try {
              holds = predicate(value, index++);
            } catch (error) {
              sink.error(error);
              return;
            }
            if (holds) {
              sink.next(value);
            } else {
              if (options.inclusive) sink.next(value);
              sink.complete();
            }
          },
        }),
      );
    }) as never;
}

/** Drops a value equal (per `compare`, `Object.is` by default) to the previous one. */
export function distinctUntilChanged(): <A, Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<A, Y>;
export function distinctUntilChanged<A>(
  compare: (previous: A, current: A) => boolean,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y>;
export function distinctUntilChanged(
  compare: (previous: any, current: any) => boolean = Object.is,
): (stream: AnyCraftStream) => AnyCraftStream {
  return (source) =>
    createCraftStream((context, sink) => {
      let hasPrevious = false;
      let previous: unknown;
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (value) => {
            if (hasPrevious) {
              let same: boolean;
              try {
                same = compare(previous, value);
              } catch (error) {
                sink.error(error);
                return;
              }
              if (same) return;
            }
            hasPrevious = true;
            previous = value;
            sink.next(value);
          },
        }),
      );
    });
}

/** Emits `values` first, then the source's values. */
export function startWith<B>(
  ...values: B[]
): <A, Y>(stream: CraftStream<A, Y>) => CraftStream<A | B, Y> {
  return (source: AnyCraftStream) =>
    createCraftStream((context, sink) => {
      for (const value of values) {
        if (sink.closed) return;
        sink.next(value);
      }
      return source[STREAM_RUN](context, sink);
    }) as never;
}

/**
 * Completes when `notifier` emits. The notifier is subscribed first, so one
 * that emits synchronously keeps the source from ever starting. A craft stream
 * notifier contributes its own dependencies and exceptions; an exception from
 * it terminates the result.
 */
export function takeUntil<N, YN>(
  notifier: CraftStream<N, YN>,
): <A, Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y | YN>;
export function takeUntil(
  notifier: Subscribable<unknown>,
): <A, Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y>;
export function takeUntil(
  notifier: Subscribable<unknown>,
): (stream: AnyCraftStream) => AnyCraftStream {
  return (source) =>
    createCraftStream((context, sink, teardown) => {
      const notifierSink = createSink<unknown>(
        {
          next: () => sink.complete(),
          exception: (exception) => sink.exception(exception),
          error: (error) => sink.error(error),
          complete: () => undefined,
        },
        () => sink.closed,
      );
      teardown.add(
        isCraftStream(notifier)
          ? notifier[STREAM_RUN](context, notifierSink)
          : notifier.subscribe({
              next: notifierSink.next,
              error: notifierSink.error,
              exception: notifierSink.exception,
            } as Parameters<Subscribable<unknown>['subscribe']>[0]),
      );
      // A notifier that fired synchronously already ended the stream.
      if (sink.closed) return;
      return source[STREAM_RUN](context, sink);
    });
}

/**
 * Completes when `destroyRef` — or, by default, the ambient one at the call —
 * is destroyed. Without either, the stream's own context decides at
 * subscription time; with none at all the stream terminates with an error
 * rather than silently never ending.
 */
export function takeUntilDestroyed(
  destroyRef?: DestroyRef,
): <A, Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y> {
  let ref = destroyRef;
  if (!ref) {
    try {
      ref = inject(DestroyRef, { optional: true }) ?? undefined;
    } catch {
      ref = undefined;
    }
  }
  const creationRef = ref;

  return (source: AnyCraftStream) =>
    createCraftStream((context, sink, teardown) => {
      const owner = creationRef ?? context.destroyRef;
      if (!owner) {
        sink.error(
          new Error(
            'takeUntilDestroyed needs a DestroyRef: call it in an injection context, pass one, or subscribe within one.',
          ),
        );
        return;
      }
      teardown.add(owner.onDestroy(() => sink.complete()));
      return source[STREAM_RUN](context, sink);
    }) as never;
}
