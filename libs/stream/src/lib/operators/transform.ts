import type {
  AnyCraftException,
  ExtractCraftException,
  MarkerFor,
  StripCraftException,
} from '@craft-ts/core';
import {
  createCraftStream,
  forwardSink,
  STREAM_RUN,
  type AnyCraftStream,
  type CraftStream,
  type StreamSink,
} from '../craft-stream';
import { runHandler } from '../internal/run-handler';
import { SerialStage } from '../internal/serial-stage';

// ---------------------------------------------------------------------------
// Per-value operators (Style C): callbacks that consume `A`. Each takes either
// a plain function or a craft generator. A generator's yields — services,
// nested programs — and the exceptions it may produce are ADDED to the stream's
// `Y`, so the dependency shows up where the pipeline is finally consumed.
//
// Handlers run one at a time, in arrival order (see `SerialStage`): there is no
// implicit buffering beyond a suspended handler, and no concurrency. Use
// `concatMap({ buffer })` / `mergeMap({ concurrency })` (wave 3) to opt in.
// ---------------------------------------------------------------------------

type OutputValue<HO> = StripCraftException<HO>;
type OutputMarker<HO> = MarkerFor<ExtractCraftException<HO>>;

type PerValueCallbacks = {
  invoke(value: unknown, index: number): unknown;
  onResult(result: unknown, input: unknown, sink: StreamSink<unknown>): void;
};

function perValue(
  source: AnyCraftStream,
  create: () => PerValueCallbacks,
): CraftStream<any, any> {
  return createCraftStream<unknown, unknown>((context, sink, teardown) => {
    const stage = new SerialStage(teardown);
    const callbacks = create();
    let index = 0;

    return source[STREAM_RUN](
      context,
      forwardSink(sink, {
        next: (input) => {
          const position = index++;
          stage.push((done) =>
            runHandler(
              context,
              () => callbacks.invoke(input, position),
              (outcome) => {
                if (outcome.kind === 'value') {
                  callbacks.onResult(outcome.value, input, sink);
                } else if (outcome.kind === 'exception') {
                  sink.exception(outcome.exception);
                } else {
                  sink.error(outcome.error);
                }
                done();
              },
            ),
          );
        },
        complete: () => stage.end(() => sink.complete()),
      }),
    );
  });
}

// --- map ---------------------------------------------------------------

/** Projects each value. A generator projection may `yield*` services. */
export function map<A, B, HY>(
  project: (value: A, index: number) => Generator<HY, B, unknown>,
): <Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<OutputValue<B>, Y | HY | OutputMarker<B>>;
export function map<A, B>(
  project: (value: A, index: number) => B,
): <Y>(
  stream: CraftStream<A, Y>,
) => CraftStream<OutputValue<B>, Y | OutputMarker<B>>;
export function map(
  project: (value: unknown, index: number) => unknown,
): (stream: AnyCraftStream) => CraftStream<any, any> {
  return (source) =>
    perValue(source, () => ({
      invoke: project,
      onResult: (result, _input, sink) => sink.next(result),
    }));
}

// --- filter ------------------------------------------------------------

/** Keeps the values the predicate accepts. */
export function filter<A, S extends A>(
  predicate: (value: A, index: number) => value is S,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<S, Y>;
export function filter<A, HY, HO extends boolean | AnyCraftException>(
  predicate: (value: A, index: number) => Generator<HY, HO, unknown>,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y | HY | OutputMarker<HO>>;
export function filter<A>(
  predicate: (value: A, index: number) => boolean,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y>;
export function filter(
  predicate: (value: unknown, index: number) => unknown,
): (stream: AnyCraftStream) => CraftStream<any, any> {
  return (source) =>
    perValue(source, () => ({
      invoke: predicate,
      onResult: (result, input, sink) => {
        if (result) sink.next(input);
      },
    }));
}

// --- tap ---------------------------------------------------------------

/** Runs a side effect per value and passes the value through. */
export function tap<A, HY, HO>(
  effect: (value: A, index: number) => Generator<HY, HO, unknown>,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y | HY | OutputMarker<HO>>;
export function tap<A>(
  effect: (value: A, index: number) => void,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<A, Y>;
export function tap(
  effect: (value: unknown, index: number) => unknown,
): (stream: AnyCraftStream) => CraftStream<any, any> {
  return (source) =>
    perValue(source, () => ({
      invoke: effect,
      onResult: (_result, input, sink) => sink.next(input),
    }));
}

// --- scan --------------------------------------------------------------

/** Accumulates values and emits every intermediate accumulator. */
export function scan<A, B, HY>(
  reducer: (
    accumulator: B,
    value: A,
    index: number,
  ) => Generator<HY, B, unknown>,
  seed: B,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<B, Y | HY>;
export function scan<A, B>(
  reducer: (accumulator: B, value: A, index: number) => B,
  seed: B,
): <Y>(stream: CraftStream<A, Y>) => CraftStream<B, Y>;
export function scan(
  reducer: (accumulator: unknown, value: unknown, index: number) => unknown,
  seed: unknown,
): (stream: AnyCraftStream) => CraftStream<any, any> {
  return (source) =>
    perValue(source, () => {
      let accumulator = seed;
      return {
        invoke: (value, index) => reducer(accumulator, value, index),
        onResult: (result, _input, sink) => {
          accumulator = result;
          sink.next(result);
        },
      };
    });
}
