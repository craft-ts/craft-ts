import {
  DestroyRef,
  ɵInjector as Injector,
  ɵinject as inject,
  ɵrunInInjectionContext as runInInjectionContext,
  ɵinjectCraftTemporalRuntime,
  type AnyCraftException,
  type CraftTemporalRuntime,
  type ExtractCraftGenExceptions,
  type StreamObserver,
  type Subscribable,
  type Unsubscribable,
} from '@craft-ts/core';
import type { CraftStreamPipe } from './craft-stream-pipe.generated';
import { traceStreamRoot, type StreamTraceEvent } from './stream-trace';

// ---------------------------------------------------------------------------
// The CraftStream carrier.
//
// `CraftStream<A, Y>` is a COLD push stream of `A`. `Y` is the same `Yielded`
// union a `craftGen` program carries: service-dependency requests the stream's
// handlers `yield*`, and `CraftGenExceptionMarker<E>` markers advertising the
// typed exceptions it may terminate with. Operators only ever grow or rewrite
// `Y`, so everything a pipeline needs — and everything that may go wrong — is
// readable off its type at the terminal.
//
// At runtime the exception channel is a dedicated terminal notification
// (`exception`), distinct from `error` (defects: unexpected throws, which are
// never catchable by `catchTag`).
// ---------------------------------------------------------------------------

declare const STREAM_TYPES: unique symbol;

/** Runtime brand + entry point of every craft stream. */
export const STREAM_RUN = Symbol('craft-stream-run');

/** The execution context a stream runs in; captured at subscription. */
export type StreamContext = {
  /** Resolves service dependencies yielded by handlers. */
  readonly injector: Injector | undefined;
  /** Ends the stream's work when its owner is destroyed. */
  readonly destroyRef: DestroyRef | undefined;
  /** Clock for the temporal operators (virtual in tests). */
  readonly temporal: CraftTemporalRuntime;
  /** Label shown in stream traces. */
  readonly name?: string;
  /** Set by a traced root subscription: receives the events of `traceStage` markers. */
  readonly trace?: (event: StreamTraceEvent) => void;
};

/** Receiving end of a running stream. Terminal notifications are exclusive. */
export interface StreamSink<A> {
  /**
   * `true` once this sink — or anything downstream of it — has terminated or
   * unsubscribed. A synchronous source polls it to stop producing early.
   */
  readonly closed: boolean;
  next(value: A): void;
  /** Typed, terminal: an `{ _tag }` exception advertised in the stream's `Y`. */
  exception(exception: unknown): void;
  /** Untyped, terminal: a defect. */
  error(error: unknown): void;
  complete(): void;
}

export type StreamRun<A> = (
  context: StreamContext,
  sink: StreamSink<A>,
) => Unsubscribable;

export interface CraftStream<out A, out Y = never> extends Subscribable<A> {
  /** Phantom carrier for the value and yielded types — never present at runtime. */
  readonly [STREAM_TYPES]?: { readonly a: A; readonly y: Y };
  readonly [STREAM_RUN]: StreamRun<A>;
  readonly pipe: CraftStreamPipe<A, Y>;
  subscribe(observer: Partial<StreamObserver<A>>): Unsubscribable;
}

/** A stream-to-stream function: what `.pipe(...)` composes. */
export type StreamOperator<AIn, YIn, AOut, YOut> = (
  stream: CraftStream<AIn, YIn>,
) => CraftStream<AOut, YOut>;

/** Any craft stream, whatever its value and yielded types. */
export type AnyCraftStream = CraftStream<any, any>;

/** The value type of a stream. */
export type StreamValue<S> = S extends CraftStream<infer A, any> ? A : never;

/** The yielded union (deps, awaits, exception markers) of a stream. */
export type StreamYielded<S> = S extends CraftStream<any, infer Y> ? Y : never;

/** The typed exceptions a stream whose yielded union is `Y` may terminate with. */
export type StreamExceptions<Y> = Extract<
  ExtractCraftGenExceptions<Y>,
  AnyCraftException
>;

export function isCraftStream(value: unknown): value is AnyCraftStream {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { [STREAM_RUN]?: unknown })[STREAM_RUN] === 'function'
  );
}

// ---------------------------------------------------------------------------
// Teardown: a one-shot bag of cleanups. Adding to an already-closed bag runs
// the cleanup at once, which is what makes synchronous sources safe — a
// `take(1)` can finish while `subscribe` has not returned yet.
// ---------------------------------------------------------------------------

export class Teardown implements Unsubscribable {
  private cleanups: Array<() => void> = [];
  private done = false;

  get closed(): boolean {
    return this.done;
  }

  add(cleanup: (() => void) | Unsubscribable | void | undefined): void {
    if (!cleanup) return;
    const run =
      typeof cleanup === 'function' ? cleanup : () => cleanup.unsubscribe();
    if (this.done) {
      run();
    } else {
      this.cleanups.push(run);
    }
  }

  unsubscribe(): void {
    if (this.done) return;
    this.done = true;
    const cleanups = this.cleanups;
    this.cleanups = [];
    for (const cleanup of cleanups.reverse()) cleanup();
  }
}

/**
 * Builds a stream from a setup function. The sink it hands over is guarded —
 * nothing passes after a terminal notification — and a terminal notification
 * (or an unsubscribe) releases everything the setup registered or returned.
 */
export function createCraftStream<A, Y = never>(
  setup: (
    context: StreamContext,
    sink: StreamSink<A>,
    teardown: Teardown,
  ) => Unsubscribable | void,
): CraftStream<A, Y> {
  const run: StreamRun<A> = (context, downstream) => {
    const teardown = new Teardown();
    let finished = false;

    const finish = (notify: () => void) => {
      if (finished) return;
      finished = true;
      try {
        notify();
      } finally {
        teardown.unsubscribe();
      }
    };

    const sink: StreamSink<A> = {
      get closed() {
        return finished || downstream.closed;
      },
      next: (value) => {
        if (!finished) downstream.next(value);
      },
      exception: (exception) => finish(() => downstream.exception(exception)),
      error: (error) => finish(() => downstream.error(error)),
      complete: () => finish(() => downstream.complete()),
    };

    try {
      teardown.add(setup(context, sink, teardown));
    } catch (error) {
      sink.error(error);
    }

    return {
      unsubscribe: () => {
        finished = true;
        teardown.unsubscribe();
      },
    };
  };

  return attachStreamApi<A, Y>(run);
}

function attachStreamApi<A, Y>(run: StreamRun<A>): CraftStream<A, Y> {
  const stream: CraftStream<A, Y> = {
    [STREAM_RUN]: run,
    subscribe(observer) {
      const context = captureStreamContext();
      return traceStreamRoot(
        context,
        observerToSink(observer),
        'subscribe',
        (sink, ctx) => run(ctx, sink),
      );
    },
    pipe: ((...operators: Array<(stream: AnyCraftStream) => AnyCraftStream>) =>
      operators.reduce<AnyCraftStream>(
        (current, operator) => operator(current),
        stream,
      )) as CraftStreamPipe<A, Y>,
  };
  return stream;
}

/** Builds a sink from handlers; `closed` tells upstream when to stop producing. */
export function createSink<A>(
  handlers: Omit<StreamSink<A>, 'closed'>,
  closed: () => boolean = () => false,
): StreamSink<A> {
  return {
    get closed() {
      return closed();
    },
    next: handlers.next,
    exception: handlers.exception,
    error: handlers.error,
    complete: handlers.complete,
  };
}

/**
 * Forwards to `sink`, overriding only the given notifications. The result
 * stays `closed` with `sink` (object spread would freeze that flag).
 */
export function forwardSink<A, B = A>(
  sink: StreamSink<B>,
  handlers: Partial<Omit<StreamSink<A>, 'closed'>>,
): StreamSink<A> {
  return {
    get closed() {
      return sink.closed;
    },
    next: handlers.next ?? ((value) => sink.next(value as unknown as B)),
    exception: handlers.exception ?? ((exception) => sink.exception(exception)),
    error: handlers.error ?? ((error) => sink.error(error)),
    complete: handlers.complete ?? (() => sink.complete()),
  };
}

export function observerToSink<A>(
  observer: Partial<StreamObserver<A>>,
): StreamSink<A> {
  return {
    closed: false,
    next: (value) => observer.next?.(value),
    exception: (exception) => {
      if (observer.exception) observer.exception(exception);
      else observer.error?.(exception);
    },
    error: (error) => observer.error?.(error),
    complete: () => observer.complete?.(),
  };
}

// ---------------------------------------------------------------------------
// Context capture.
// ---------------------------------------------------------------------------

export type StreamContextOptions = {
  /** Injector resolving dependencies; defaults to the ambient injection context. */
  readonly injector?: Injector;
  readonly destroyRef?: DestroyRef;
  /** Label shown in stream traces (`provideStreamTrace`). */
  readonly name?: string;
};

/**
 * Builds the context a stream runs in. Outside an injection context and
 * without an explicit injector the context is injector-less: pure streams still
 * run, a handler that `yield*`s a service fails with a clear error.
 */
export function captureStreamContext(
  options: StreamContextOptions = {},
): StreamContext {
  let injector: Injector | undefined = options.injector;
  if (!injector) {
    try {
      injector = inject(Injector, { optional: true }) ?? undefined;
    } catch {
      injector = undefined;
    }
  }

  let destroyRef: DestroyRef | undefined = options.destroyRef;
  if (!destroyRef) {
    try {
      destroyRef = injector
        ? (injector.get(DestroyRef, null) ?? undefined)
        : (inject(DestroyRef, { optional: true }) ?? undefined);
    } catch {
      destroyRef = undefined;
    }
  }

  const resolveTemporal = (): CraftTemporalRuntime =>
    injector
      ? runInInjectionContext(injector, () => ɵinjectCraftTemporalRuntime())
      : ɵinjectCraftTemporalRuntime();
  let temporal: CraftTemporalRuntime | undefined;

  return {
    injector,
    destroyRef,
    name: options.name,
    get temporal() {
      return (temporal ??= resolveTemporal());
    },
  };
}
