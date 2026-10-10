import {
  CraftGenShortCircuit,
  GUARD_AWAIT_REQUEST_MARKER,
  ɵcreateCraftProgram as createCraftProgram,
  type AnyCraftException,
  type CompleteServiceDependencyMapFromYielded,
  type CraftPipeableProgram,
  type RuntimeGuardAwaitRequest,
  type Unsubscribable,
  ɵInjector as Injector,
} from '@craft-ts/core';
import {
  captureStreamContext,
  createSink,
  STREAM_RUN,
  type StreamExceptions,
  type AnyCraftStream,
  type CraftStream,
  type StreamContextOptions,
  type StreamSink,
} from './craft-stream';
import { traceStreamRoot } from './stream-trace';

// ---------------------------------------------------------------------------
// Terminals: where a pipeline's type is finally CONSUMED.
//
// - program terminals (`lastValueFrom`, `firstValueFrom`, `toArray`,
//   `runForEach`) turn a stream into a craft program you `yield*`: its `Y`
//   (dependencies, exception markers) becomes the program's `Yielded`;
// - `subscribe` takes an observer and refuses to compile without a handler for
//   every exception the stream may end with;
// - `streamSignal` (see ./stream-signal) exposes a stream as a named service
//   primitive.
// ---------------------------------------------------------------------------

// --- program terminals ---------------------------------------------------

/** Thrown (as a defect) when a program terminal needs a value and gets none. */
export class EmptyStreamProgramError extends Error {
  constructor() {
    super('The stream completed without emitting a value.');
    this.name = 'EmptyStreamProgramError';
  }
}

type Outcome<R> =
  | { readonly kind: 'value'; readonly value: R }
  | { readonly kind: 'exception'; readonly exception: unknown }
  | { readonly kind: 'error'; readonly error: unknown };

/**
 * Runs `stream` to a terminal state as a program. A stream that settles in the
 * same tick returns without suspending, so it also works in synchronous hosts;
 * otherwise the program suspends on a promise whose `cancel` hook releases the
 * subscription when the program is aborted or its injector destroyed.
 */
function drain<A, Y, R>(
  stream: CraftStream<A, Y>,
  collect: (
    settle: (outcome: Outcome<R>) => void,
  ) => Omit<StreamSink<A>, 'closed'>,
  options?: StreamContextOptions,
): CraftPipeableProgram<Y | RuntimeGuardAwaitRequest, R> {
  return createCraftProgram(function* () {
    const context = captureStreamContext(options);
    let outcome: Outcome<R> | undefined;
    let resolveOutcome: ((outcome: Outcome<R>) => void) | undefined;
    const settled = new Promise<Outcome<R>>((resolve) => {
      resolveOutcome = resolve;
    });
    const settle = (value: Outcome<R>) => {
      if (outcome) return;
      outcome = value;
      resolveOutcome?.(value);
    };

    const subscription: Unsubscribable = traceStreamRoot(
      context,
      createSink(collect(settle), () => outcome !== undefined),
      'program',
      (sink) => (stream as AnyCraftStream)[STREAM_RUN](context, sink),
    );

    if (!outcome) {
      yield {
        [GUARD_AWAIT_REQUEST_MARKER]: true,
        kind: 'promise',
        value: settled,
        cancel: () => subscription.unsubscribe(),
      } satisfies RuntimeGuardAwaitRequest as never;
    }
    subscription.unsubscribe();

    const result = outcome as Outcome<R> | undefined;
    if (!result) {
      // Resumed without a settlement: the driver cannot have awaited the request.
      throw new Error('A stream program resumed before the stream settled.');
    }
    if (result.kind === 'exception') {
      throw new CraftGenShortCircuit(result.exception as AnyCraftException);
    }
    if (result.kind === 'error') throw result.error;
    return result.value;
  }) as never;
}

/** Resolves with the last value; an empty stream is a defect unless `defaultValue` is given. */
export function lastValueFrom<A, Y>(
  stream: CraftStream<A, Y>,
  options?: StreamContextOptions & { defaultValue?: undefined },
): CraftPipeableProgram<Y | RuntimeGuardAwaitRequest, A>;
export function lastValueFrom<A, Y, D>(
  stream: CraftStream<A, Y>,
  options: StreamContextOptions & { defaultValue: D },
): CraftPipeableProgram<Y | RuntimeGuardAwaitRequest, A | D>;
export function lastValueFrom(
  stream: AnyCraftStream,
  options: StreamContextOptions & { defaultValue?: unknown } = {},
): unknown {
  return drain<unknown, unknown, unknown>(
    stream,
    (settle) => {
      let last: { value: unknown } | undefined;
      return {
        next: (value) => {
          last = { value };
        },
        exception: (exception) => settle({ kind: 'exception', exception }),
        error: (error) => settle({ kind: 'error', error }),
        complete: () => {
          if (last) settle({ kind: 'value', value: last.value });
          else if ('defaultValue' in options) {
            settle({ kind: 'value', value: options.defaultValue });
          } else {
            settle({ kind: 'error', error: new EmptyStreamProgramError() });
          }
        },
      };
    },
    options,
  );
}

/** Resolves with the first value, then stops the stream. */
export function firstValueFrom<A, Y>(
  stream: CraftStream<A, Y>,
  options?: StreamContextOptions & { defaultValue?: undefined },
): CraftPipeableProgram<Y | RuntimeGuardAwaitRequest, A>;
export function firstValueFrom<A, Y, D>(
  stream: CraftStream<A, Y>,
  options: StreamContextOptions & { defaultValue: D },
): CraftPipeableProgram<Y | RuntimeGuardAwaitRequest, A | D>;
export function firstValueFrom(
  stream: AnyCraftStream,
  options: StreamContextOptions & { defaultValue?: unknown } = {},
): unknown {
  return drain<unknown, unknown, unknown>(
    stream,
    (settle) => ({
      next: (value) => settle({ kind: 'value', value }),
      exception: (exception) => settle({ kind: 'exception', exception }),
      error: (error) => settle({ kind: 'error', error }),
      complete: () => {
        if ('defaultValue' in options) {
          settle({ kind: 'value', value: options.defaultValue });
        } else {
          settle({ kind: 'error', error: new EmptyStreamProgramError() });
        }
      },
    }),
    options,
  );
}

/** Collects every value. */
export function toArray<A, Y>(
  stream: CraftStream<A, Y>,
  options?: StreamContextOptions,
): CraftPipeableProgram<Y | RuntimeGuardAwaitRequest, A[]> {
  return drain<A, Y, A[]>(
    stream,
    (settle) => {
      const values: A[] = [];
      return {
        next: (value) => {
          values.push(value);
        },
        exception: (exception) => settle({ kind: 'exception', exception }),
        error: (error) => settle({ kind: 'error', error }),
        complete: () => settle({ kind: 'value', value: values }),
      };
    },
    options,
  );
}

/** Runs `effect` for every value; resolves once the stream completes. */
export function runForEach<A, Y>(
  stream: CraftStream<A, Y>,
  effect: (value: A) => void,
  options?: StreamContextOptions,
): CraftPipeableProgram<Y | RuntimeGuardAwaitRequest, void> {
  return drain<A, Y, void>(
    stream,
    (settle) => ({
      next: (value) => {
        try {
          effect(value);
        } catch (error) {
          settle({ kind: 'error', error });
        }
      },
      exception: (exception) => settle({ kind: 'exception', exception }),
      error: (error) => settle({ kind: 'error', error }),
      complete: () => settle({ kind: 'value', value: undefined }),
    }),
    options,
  );
}

// --- subscribe -------------------------------------------------------------

type ExceptionHandlerMap<E extends AnyCraftException> = {
  [Tag in E['_tag']]: (exception: Extract<E, { _tag: Tag }>) => void;
};

/** What an observer must provide for the exceptions `E` a stream may end with. */
export type ExceptionObserverFor<E extends AnyCraftException> = [E] extends [
  never,
]
  ? { exception?: undefined }
  : { exception: ((exception: E) => void) | ExceptionHandlerMap<E> };

export type SubscribeObserver<A, Y> = {
  next?: (value: A) => void;
  /** Defects only — unexpected throws, never a typed exception. */
  error?: (error: unknown) => void;
  complete?: () => void;
} & ExceptionObserverFor<StreamExceptions<Y>>;

export type SubscribeOptions = {
  readonly injector?: Injector;
  /** Label shown in stream traces (`provideStreamTrace`). */
  readonly name?: string;
};

type ServiceNamesOf<Y> = keyof CompleteServiceDependencyMapFromYielded<Y> &
  string;

/**
 * Brand that replaces the stream parameter when the stream depends on services
 * and no injector was given — its property names the missing dependencies.
 */
export type MissingStreamInjector<Services extends string> = {
  readonly 'subscribe needs an injector to resolve these services': Services;
};

type InjectorCheck<Y, Options> = [ServiceNamesOf<Y>] extends [never]
  ? unknown
  : Options extends { readonly injector: Injector }
    ? unknown
    : MissingStreamInjector<ServiceNamesOf<Y>>;

/**
 * Subscribes an observer. Compile-time guarantees:
 * - when the stream may end with typed exceptions, `observer.exception` is
 *   required — a function receiving the union, or a `{ [Tag]: handler }` map
 *   covering every tag;
 * - when the stream depends on services, an `{ injector }` must be passed.
 *
 * ```ts
 * subscribe(users$, {
 *   next: (user) => ...,
 *   exception: { NotFound: (e) => ..., Forbidden: (e) => ... },
 * }, { injector });
 * ```
 */
export function subscribe<
  A,
  Y,
  Options extends SubscribeOptions | undefined = undefined,
>(
  stream: CraftStream<A, Y> & InjectorCheck<Y, Options>,
  observer: SubscribeObserver<A, Y>,
  options?: Options,
): Unsubscribable {
  const context = captureStreamContext(options);
  const exception = observer.exception as
    | ((exception: never) => void)
    | Record<string, (exception: never) => void>
    | undefined;

  const dispatchException = (value: unknown) => {
    if (typeof exception === 'function') {
      exception(value as never);
      return;
    }
    const tag = (value as { _tag?: string } | null)?._tag;
    const handler =
      exception && tag !== undefined && Object.hasOwn(exception, tag)
        ? exception[tag]
        : undefined;
    if (handler) handler(value as never);
    else observer.error?.(value);
  };

  return traceStreamRoot(
    context,
    createSink<unknown>({
      next: (value) => observer.next?.(value as A),
      exception: dispatchException,
      error: (error) => observer.error?.(error),
      complete: () => observer.complete?.(),
    }),
    'subscribe',
    (sink) => (stream as AnyCraftStream)[STREAM_RUN](context, sink),
  );
}
