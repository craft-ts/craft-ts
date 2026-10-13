import type {
  AnyCraftException,
  CatchTagExhaustiveCodesCheck,
  ExcludeByCode,
  ExtractCraftException,
  ExtractCraftGenExceptions,
  MarkerFor,
  StripCraftException,
  StripGenExceptionMarkers,
} from '@craft-ts/core';
import {
  createCraftStream,
  forwardSink,
  isCraftStream,
  STREAM_RUN,
  type AnyCraftStream,
  type CraftStream,
  type StreamExceptions,
} from '../craft-stream';
import { runHandler } from '../internal/run-handler';

// ---------------------------------------------------------------------------
// Exception-channel operators.
//
// An operator factory (`catchTag('NotFound', handler)`) is called BEFORE the
// stream it is piped onto is known, so the handler's exception parameter cannot
// be read from an enclosing scope. Instead the returned operator is written
// against the exception union `E` as an OUTER type parameter: TypeScript infers
// it from the `.pipe(...)` slot's expected operator type (the piped stream's
// markers), which types the handler's parameter as
// `Extract<E, { _tag: Code }>` and rejects a code the stream cannot produce.
//
// The union `E` lives only in `Y` (as `CraftGenExceptionMarker<E>`); at runtime
// an exception is the terminal `exception` notification. A defect (`error`) is
// never caught here.
// ---------------------------------------------------------------------------

type Distribute<R, Pick extends 'yielded' | 'output'> =
  R extends Generator<infer Yielded, infer Output, any>
    ? Pick extends 'yielded'
      ? Yielded
      : Output
    : Pick extends 'yielded'
      ? never
      : R;

type FnResult<H> = H extends (...args: any[]) => infer R ? R : never;
/** What a handler (plain or generator) yields — its dependencies and awaits. */
type FnYielded<H> = Distribute<FnResult<H>, 'yielded'>;
/** What a handler resolves to (a plain function's result, or a generator's return). */
type FnOutput<H> = Distribute<FnResult<H>, 'output'>;

/** Exceptions a handler may itself produce: nested programs and returned exceptions. */
type FnExceptions<H> = Extract<
  ExtractCraftGenExceptions<FnYielded<H>> | ExtractCraftException<FnOutput<H>>,
  AnyCraftException
>;

type OutcomeNotifier = {
  value(value: unknown): void;
  exception(exception: unknown): void;
  error(error: unknown): void;
};

function recover(
  lookup: (exception: unknown) => ((exception: any) => unknown) | undefined,
): (stream: AnyCraftStream) => AnyCraftStream {
  return (source) =>
    createCraftStream((context, sink, teardown) => {
      let handle: { unsubscribe(): void } | undefined;
      teardown.add(() => handle?.unsubscribe());
      const notifier: OutcomeNotifier = {
        value: (value) => {
          sink.next(value);
          sink.complete();
        },
        exception: (exception) => sink.exception(exception),
        error: (error) => sink.error(error),
      };

      return source[STREAM_RUN](
        context,
        forwardSink(sink, {
          exception: (exception) => {
            const handler = lookup(exception);
            if (!handler) {
              // No handler for this code (or a foreign exception): pass it on.
              sink.exception(exception);
              return;
            }
            handle = runHandler(
              context,
              () => handler(exception),
              (outcome) => {
                if (outcome.kind === 'value') notifier.value(outcome.value);
                else if (outcome.kind === 'exception') {
                  notifier.exception(outcome.exception);
                } else notifier.error(outcome.error);
              },
            );
          },
        }),
      );
    });
}

function tagOf(exception: unknown): string | undefined {
  return typeof exception === 'object' && exception !== null
    ? (exception as { _tag?: string })._tag
    : undefined;
}

type ExhaustiveHandlers<E extends AnyCraftException> = {
  [Code in E['_tag']]: (exception: Extract<E, { _tag: Code }>) => unknown;
};

type HandlersYielded<Handlers> = {
  [K in keyof Handlers]: FnYielded<Handlers[K]>;
}[keyof Handlers];
type HandlersOutput<Handlers> = {
  [K in keyof Handlers]: FnOutput<Handlers[K]>;
}[keyof Handlers];
type HandlersExceptions<Handlers> = {
  [K in keyof Handlers]: FnExceptions<Handlers[K]>;
}[keyof Handlers];

export interface CatchTagOperator {
  /**
   * Catches the stream's exception tagged `Code`: the handler (a function or a
   * craft generator — its `yield*`s are tracked) runs in its place, its result
   * is emitted, and the stream completes. `Code` leaves the exception union;
   * exceptions the handler itself produces join it. The handler's parameter is
   * typed from the piped stream, and a code the stream cannot produce is a
   * compile error.
   */
  <YIn, Code extends StreamExceptions<YIn>['_tag'], A, HY, HO>(
    code: Code,
    handler: (
      exception: Extract<StreamExceptions<YIn>, { _tag: Code }>,
    ) => Generator<HY, HO, unknown>,
  ): (
    stream: CraftStream<A, YIn>,
  ) => CraftStream<
    A | StripCraftException<HO>,
    | StripGenExceptionMarkers<YIn>
    | StripGenExceptionMarkers<HY>
    | MarkerFor<
        | Extract<ExcludeByCode<StreamExceptions<YIn>, Code>, AnyCraftException>
        | Extract<
            ExtractCraftGenExceptions<HY> | ExtractCraftException<HO>,
            AnyCraftException
          >
      >
  >;
  <YIn, Code extends StreamExceptions<YIn>['_tag'], A, HO>(
    code: Code,
    handler: (exception: Extract<StreamExceptions<YIn>, { _tag: Code }>) => HO,
  ): (
    stream: CraftStream<A, YIn>,
  ) => CraftStream<
    A | StripCraftException<HO>,
    | StripGenExceptionMarkers<YIn>
    | MarkerFor<
        | Extract<ExcludeByCode<StreamExceptions<YIn>, Code>, AnyCraftException>
        | Extract<ExtractCraftException<HO>, AnyCraftException>
      >
  >;

  /**
   * Catches **every** reachable exception through a handler map covering
   * exactly the stream's exception union: a missing code is a compile error at
   * the handler map, a handler for an unreachable code a compile error at the
   * `.pipe` application.
   */
  exhaustive: <
    YIn,
    Handlers extends ExhaustiveHandlers<StreamExceptions<YIn>>,
    A,
  >(
    handlers: Handlers,
  ) => (
    stream: CraftStream<A, YIn> &
      CatchTagExhaustiveCodesCheck<StreamExceptions<YIn>['_tag'], Handlers>,
  ) => CraftStream<
    A | StripCraftException<HandlersOutput<Handlers>>,
    | StripGenExceptionMarkers<YIn>
    | StripGenExceptionMarkers<HandlersYielded<Handlers>>
    | MarkerFor<
        Extract<
          | HandlersExceptions<Handlers>
          | ExtractCraftException<HandlersOutput<Handlers>>,
          AnyCraftException
        >
      >
  >;
}

function catchTagImpl(
  code: string,
  handler: (exception: unknown) => unknown,
): (stream: AnyCraftStream) => AnyCraftStream {
  return recover((exception) =>
    tagOf(exception) === code ? handler : undefined,
  );
}

function catchTagExhaustiveImpl(
  handlers: Record<string, (exception: unknown) => unknown>,
): (stream: AnyCraftStream) => AnyCraftStream {
  return recover((exception) => {
    const tag = tagOf(exception);
    return tag !== undefined && Object.hasOwn(handlers, tag)
      ? handlers[tag]
      : undefined;
  });
}

export const catchTag: CatchTagOperator = Object.assign(
  catchTagImpl as unknown as CatchTagOperator,
  {
    exhaustive:
      catchTagExhaustiveImpl as unknown as CatchTagOperator['exhaustive'],
  },
);

/**
 * Rewrites the stream's exceptions: every exception goes through `mapper`, the
 * result replaces it in the exception union. Defects and values pass through.
 */
export function mapException<YIn, E2 extends AnyCraftException, A>(
  mapper: (exception: StreamExceptions<YIn>) => E2,
): (
  stream: CraftStream<A, YIn>,
) => CraftStream<A, StripGenExceptionMarkers<YIn> | MarkerFor<E2>> {
  return ((source: AnyCraftStream) =>
    createCraftStream((context, sink) =>
      source[STREAM_RUN](
        context,
        forwardSink(sink, {
          exception: (exception) => {
            let mapped: unknown;
            try {
              mapped = mapper(exception as StreamExceptions<YIn>);
            } catch (error) {
              sink.error(error);
              return;
            }
            sink.exception(mapped);
          },
        }),
      ),
    )) as never;
}

/**
 * On any exception, continues with the stream `fallback` returns. The
 * original exceptions leave the union; the fallback's values, dependencies and
 * exceptions take over.
 */
export function orElse<YIn, B, YB, A>(
  fallback: (exception: StreamExceptions<YIn>) => CraftStream<B, YB>,
): (
  stream: CraftStream<A, YIn>,
) => CraftStream<A | B, StripGenExceptionMarkers<YIn> | YB> {
  return ((source: AnyCraftStream) =>
    createCraftStream((context, sink, teardown) =>
      source[STREAM_RUN](
        context,
        forwardSink(sink, {
          exception: (exception) => {
            let replacement: unknown;
            try {
              replacement = fallback(exception as StreamExceptions<YIn>);
            } catch (error) {
              sink.error(error);
              return;
            }
            if (!isCraftStream(replacement)) {
              sink.error(
                new Error('orElse: the fallback must return a craft stream.'),
              );
              return;
            }
            teardown.add(replacement[STREAM_RUN](context, sink));
          },
        }),
      ),
    )) as never;
}
