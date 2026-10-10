import type { Unsubscribable } from '@craft-ts/core';
import {
  createCraftStream,
  createSink,
  forwardSink,
  STREAM_RUN,
  type AnyCraftStream,
  type CraftStream,
  type StreamContext,
  type StreamSink,
  type StreamValue,
  type StreamYielded,
} from '../craft-stream';

// ---------------------------------------------------------------------------
// Combination: several streams become one. The result's `Y` is the union of
// every input's `Y` — the dependencies and exceptions of all of them — and an
// exception or defect in any input terminates the result.
// ---------------------------------------------------------------------------

type Slot = { readonly stream: AnyCraftStream; readonly key: PropertyKey };

/** Subscribes every input with the same sink; returns the subscriptions. */
function subscribeAll(
  context: StreamContext,
  slots: readonly Slot[],
  make: (slot: Slot, position: number) => StreamSink<unknown>,
): Unsubscribable {
  const subscriptions: Unsubscribable[] = [];
  let stopped = false;
  slots.forEach((slot, position) => {
    if (stopped) return;
    subscriptions.push(slot.stream[STREAM_RUN](context, make(slot, position)));
  });
  return {
    unsubscribe() {
      stopped = true;
      for (const subscription of subscriptions) subscription.unsubscribe();
    },
  };
}

function toSlots(
  streams: readonly AnyCraftStream[] | Record<string, AnyCraftStream>,
): { slots: Slot[]; isRecord: boolean } {
  if (Array.isArray(streams)) {
    return {
      slots: streams.map((stream, key) => ({ stream, key })),
      isRecord: false,
    };
  }
  return {
    slots: Object.entries(streams).map(([key, stream]) => ({ stream, key })),
    isRecord: true,
  };
}

function shape(
  isRecord: boolean,
  slots: readonly Slot[],
  values: readonly unknown[],
): unknown {
  return isRecord
    ? Object.fromEntries(slots.map((slot, i) => [slot.key, values[i]]))
    : [...values];
}

/**
 * Emits the latest value of every input each time one of them emits, once all
 * have emitted. Completes when all inputs complete — or as soon as one
 * completes without ever having emitted (the result could never emit).
 * Takes a tuple (emits a tuple) or a record (emits a record).
 */
export function combineLatest<const S extends readonly AnyCraftStream[]>(
  streams: S,
): CraftStream<
  { -readonly [K in keyof S]: StreamValue<S[K]> },
  StreamYielded<S[number]>
>;
export function combineLatest<const S extends Record<string, AnyCraftStream>>(
  streams: S,
): CraftStream<
  { -readonly [K in keyof S]: StreamValue<S[K]> },
  StreamYielded<S[keyof S]>
>;
export function combineLatest(
  streams: readonly AnyCraftStream[] | Record<string, AnyCraftStream>,
): CraftStream<any, any> {
  return createCraftStream<unknown, unknown>((context, sink) => {
    const { slots, isRecord } = toSlots(streams);
    if (slots.length === 0) {
      sink.complete();
      return;
    }
    const latest: unknown[] = new Array(slots.length);
    const has: boolean[] = new Array(slots.length).fill(false);
    let received = 0;
    let open = slots.length;

    return subscribeAll(context, slots, (_slot, position) =>
      createSink<unknown>(
        {
          next: (value) => {
            latest[position] = value;
            if (!has[position]) {
              has[position] = true;
              received += 1;
            }
            if (received === slots.length) {
              sink.next(shape(isRecord, slots, latest));
            }
          },
          exception: (exception) => sink.exception(exception),
          error: (error) => sink.error(error),
          complete: () => {
            open -= 1;
            if (open === 0 || !has[position]) sink.complete();
          },
        },
        () => sink.closed,
      ),
    );
  });
}

/** Interleaves the values of every input; completes when all have. */
export function merge<const S extends readonly AnyCraftStream[]>(
  ...streams: S
): CraftStream<StreamValue<S[number]>, StreamYielded<S[number]>> {
  return createCraftStream<unknown, unknown>((context, sink) => {
    const { slots } = toSlots(streams);
    if (slots.length === 0) {
      sink.complete();
      return;
    }
    let open = slots.length;
    return subscribeAll(context, slots, () =>
      createSink<unknown>(
        {
          next: (value) => sink.next(value),
          exception: (exception) => sink.exception(exception),
          error: (error) => sink.error(error),
          complete: () => {
            open -= 1;
            if (open === 0) sink.complete();
          },
        },
        () => sink.closed,
      ),
    ) as Unsubscribable;
  }) as never;
}

/**
 * Pairs values by position: emits a tuple once every input has produced its
 * n-th value. **It buffers** the values of the faster inputs until the slower
 * ones catch up — the only unbounded buffer in the library, inherent to `zip`.
 * Completes as soon as an input has completed with nothing left to pair.
 */
export function zip<const S extends readonly AnyCraftStream[]>(
  ...streams: S
): CraftStream<
  { -readonly [K in keyof S]: StreamValue<S[K]> },
  StreamYielded<S[number]>
> {
  return createCraftStream<unknown, unknown>((context, sink) => {
    const { slots } = toSlots(streams);
    if (slots.length === 0) {
      sink.complete();
      return;
    }
    const queues: unknown[][] = slots.map(() => []);
    const done: boolean[] = slots.map(() => false);

    const flush = () => {
      while (queues.every((queue) => queue.length > 0)) {
        sink.next(queues.map((queue) => queue.shift()));
      }
      // An input that completed with an empty queue can never pair again.
      if (done.some((isDone, i) => isDone && queues[i].length === 0)) {
        sink.complete();
      }
    };

    return subscribeAll(context, slots, (_slot, position) =>
      createSink<unknown>(
        {
          next: (value) => {
            queues[position].push(value);
            flush();
          },
          exception: (exception) => sink.exception(exception),
          error: (error) => sink.error(error),
          complete: () => {
            done[position] = true;
            flush();
          },
        },
        () => sink.closed,
      ),
    );
  }) as never;
}

/**
 * Mirrors whichever input emits first (an exception or completion also counts
 * as "first"); the others are unsubscribed.
 */
export function race<const S extends readonly AnyCraftStream[]>(
  ...streams: S
): CraftStream<StreamValue<S[number]>, StreamYielded<S[number]>> {
  return createCraftStream<unknown, unknown>((context, sink) => {
    const { slots } = toSlots(streams);
    if (slots.length === 0) {
      sink.complete();
      return;
    }
    let winner = -1;
    const subscriptions: Unsubscribable[] = [];
    const claim = (position: number): boolean => {
      if (winner === -1) {
        winner = position;
        subscriptions.forEach((subscription, i) => {
          if (i !== position) subscription.unsubscribe();
        });
      }
      return winner === position;
    };

    slots.forEach((slot, position) => {
      if (winner !== -1) return;
      subscriptions.push(
        slot.stream[STREAM_RUN](
          context,
          createSink<unknown>(
            {
              next: (value) => claim(position) && sink.next(value),
              exception: (exception) =>
                claim(position) && sink.exception(exception),
              error: (error) => claim(position) && sink.error(error),
              complete: () => claim(position) && sink.complete(),
            },
            () => sink.closed || (winner !== -1 && winner !== position),
          ),
        ),
      );
      // This input may have lost to one that decided synchronously meanwhile.
      if (winner !== -1 && winner !== position) {
        subscriptions[subscriptions.length - 1].unsubscribe();
      }
    });

    return {
      unsubscribe() {
        for (const subscription of subscriptions) subscription.unsubscribe();
      },
    };
  }) as never;
}

/**
 * Combines each value with the latest value of `other`. Values that arrive
 * before `other` has emitted are dropped. `other` is subscribed first, and its
 * exceptions and defects terminate the result.
 */
export function withLatestFrom<B, YB>(
  other: CraftStream<B, YB>,
): <A, Y>(stream: CraftStream<A, Y>) => CraftStream<[A, B], Y | YB> {
  return ((source: AnyCraftStream) =>
    createCraftStream<unknown, unknown>((context, sink, teardown) => {
      let has = false;
      let latest: unknown;
      teardown.add(
        (other as AnyCraftStream)[STREAM_RUN](
          context,
          createSink<unknown>(
            {
              next: (value) => {
                has = true;
                latest = value;
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
            if (has) sink.next([value, latest]);
          },
        }),
      );
    })) as never;
}
