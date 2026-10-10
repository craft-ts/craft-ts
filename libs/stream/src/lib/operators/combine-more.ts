import type { Unsubscribable } from '@craft-ts/core';
import {
  createCraftStream,
  createSink,
  forwardSink,
  STREAM_RUN,
  type AnyCraftStream,
  type CraftStream,
  type StreamValue,
  type StreamYielded,
} from '../craft-stream';
import {
  combineLatest,
  race,
  shape,
  subscribeAll,
  toSlots,
  zip,
} from './combine';
import { filter } from './transform';

// ---------------------------------------------------------------------------
// The remaining combination forms: `…With` operators, `…All` operators over a
// stream of streams, and the creators `forkJoin` and `partition`. As everywhere
// in combination, the result's `Y` is the union of every input's `Y`.
// ---------------------------------------------------------------------------

/** `source` zipped with each of `others`, as a tuple. */
export function zipWith<const S extends readonly AnyCraftStream[]>(
  ...others: S
): <A, Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<
  [A, ...{ -readonly [K in keyof S]: StreamValue<S[K]> }],
  Y | StreamYielded<S[number]>
> {
  return ((source: AnyCraftStream) => zip(source, ...others)) as never;
}

/** Mirrors whichever of `source` and `others` emits first. */
export function raceWith<const S extends readonly AnyCraftStream[]>(
  ...others: S
): <A, Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<A | StreamValue<S[number]>, Y | StreamYielded<S[number]>> {
  return ((source: AnyCraftStream) => race(source, ...others)) as never;
}

type StreamOfStreams<B, YB, Y> = CraftStream<CraftStream<B, YB>, Y>;

/** Collects the inner streams until the source completes, then `zip`s them. */
export function zipAll(): <B, YB, Y>(
  stream: StreamOfStreams<B, YB, Y>,
) => CraftStream<B[], Y | YB> {
  return collectThen((inners) => zip(...inners)) as never;
}

/** Collects the inner streams until the source completes, then `combineLatest`s them. */
export function combineLatestAll(): <B, YB, Y>(
  stream: StreamOfStreams<B, YB, Y>,
) => CraftStream<B[], Y | YB> {
  return collectThen((inners) => combineLatest(inners)) as never;
}

function collectThen(
  combine: (inners: AnyCraftStream[]) => AnyCraftStream,
): (source: AnyCraftStream) => AnyCraftStream {
  return (source) =>
    createCraftStream<unknown, unknown>((context, sink, teardown) => {
      const inners: AnyCraftStream[] = [];
      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          next: (inner) => {
            inners.push(inner as AnyCraftStream);
          },
          complete: () => {
            teardown.add(combine(inners)[STREAM_RUN](context, sink));
          },
        }),
      );
    });
}

/**
 * Waits for every input to complete, then emits the LAST value of each — as a
 * tuple or a record — once. An input that completes without a value completes
 * the result without emitting. An exception or defect in any input terminates it.
 */
export function forkJoin<const S extends readonly AnyCraftStream[]>(
  streams: S,
): CraftStream<
  { -readonly [K in keyof S]: StreamValue<S[K]> },
  StreamYielded<S[number]>
>;
export function forkJoin<const S extends Record<string, AnyCraftStream>>(
  streams: S,
): CraftStream<
  { -readonly [K in keyof S]: StreamValue<S[K]> },
  StreamYielded<S[keyof S]>
>;
export function forkJoin(
  streams: readonly AnyCraftStream[] | Record<string, AnyCraftStream>,
): CraftStream<any, any> {
  return createCraftStream<unknown, unknown>((context, sink) => {
    const { slots, isRecord } = toSlots(streams);
    if (slots.length === 0) {
      sink.complete();
      return;
    }
    const last: unknown[] = new Array(slots.length);
    const has: boolean[] = new Array(slots.length).fill(false);
    let open = slots.length;

    return subscribeAll(context, slots, (_slot, position) =>
      createSink<unknown>(
        {
          next: (value) => {
            last[position] = value;
            has[position] = true;
          },
          exception: (exception) => sink.exception(exception),
          error: (error) => sink.error(error),
          complete: () => {
            if (!has[position]) {
              sink.complete();
              return;
            }
            open -= 1;
            if (open === 0) {
              sink.next(shape(isRecord, slots, last));
              sink.complete();
            }
          },
        },
        () => sink.closed,
      ),
    ) as Unsubscribable;
  }) as never;
}

/**
 * Splits a stream in two by a predicate: the values it accepts, and the ones it
 * rejects. Each half is its own cold subscription of `source`. A type guard
 * narrows both halves.
 */
export function partition<A, B extends A, Y>(
  source: CraftStream<A, Y>,
  predicate: (value: A, index: number) => value is B,
): [CraftStream<B, Y>, CraftStream<Exclude<A, B>, Y>];
export function partition<A, Y>(
  source: CraftStream<A, Y>,
  predicate: (value: A, index: number) => boolean,
): [CraftStream<A, Y>, CraftStream<A, Y>];
export function partition(
  source: AnyCraftStream,
  predicate: (value: unknown, index: number) => boolean,
): [AnyCraftStream, AnyCraftStream] {
  return [
    source.pipe(filter(predicate)),
    source.pipe(filter((value: unknown, index: number) => !predicate(value, index))),
  ] as never;
}
