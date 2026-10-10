import {
  getCurrentStartCorrelationId,
  isCraftControlFlow,
  ɵinjectCorrelationIdServiceIn,
  ɵinjectCraftRuntimeMode,
  ɵinjectTakeAppSnapshotIn,
  ɵInjector as Injector,
  ɵrunInInjectionContext as runInInjectionContext,
  ɵuntracked as untracked,
  type ɵProvider as Provider,
  type Unsubscribable,
} from '@craft-ts/core';
import type { StreamContext, StreamSink } from './craft-stream';

// ---------------------------------------------------------------------------
// Observability of streams, the counterpart of `provideFnWrapper`,
// `provideCraftHttpTrace` and `provideTakeAppSnapshot` for push pipelines.
//
// Three mechanisms cooperate:
//
// 1. Handlers (`map`, `mergeMap`, `catchTag`, …) run through `injectFnWrapper`
//    (see ./internal/run-handler), so every `provideFnWrapper` — correlation
//    ids, app snapshots, timing — sees stream work like any other craft
//    function.
// 2. `provideStreamTrace` observes the lifecycle of each ROOT subscription
//    (`subscribe`, a program terminal, `streamSignal`, an adapter): subscribe,
//    every notification, unsubscribe.
// 3. A defect ending a root subscription takes an app snapshot, unless a
//    function wrapper already did for that very error.
//
// All of it is development-only, as the HTTP trace is: in production the root
// subscription runs unwrapped.
// ---------------------------------------------------------------------------

/** Multi-provider key, a plain object like `FN_WRAPPER`: no token to construct while loading. */
export const STREAM_TRACE = Object.freeze({});

export type StreamTraceRoot = 'subscribe' | 'program' | 'signal' | 'adapter';

export type StreamTraceContext = Readonly<{
  /** Unique per root subscription, stable across its events. */
  streamId: string;
  /** The name given through the context options (`streamSignal` passes its own). */
  name: string | undefined;
  /** Which entry point started this subscription. */
  root: StreamTraceRoot;
  /**
   * The correlation id current when the subscription started: the user gesture
   * (or navigation) that caused this stream to run, when correlation tracking
   * is enabled.
   */
  startCorrelationId: string | null;
}>;

export type StreamTraceEvent =
  | Readonly<{ kind: 'subscribe' }>
  | Readonly<{ kind: 'next'; value: unknown; index: number }>
  | Readonly<{ kind: 'exception'; exception: unknown }>
  | Readonly<{ kind: 'error'; error: unknown }>
  | Readonly<{ kind: 'complete' }>
  /** A notification passing a `traceStage(label)` marker inside the pipeline. */
  | Readonly<{
      kind: 'stage';
      stage: string;
      notification: 'next' | 'exception' | 'error' | 'complete';
      value?: unknown;
      index?: number;
    }>
  /** The consumer left before any terminal notification. */
  | Readonly<{ kind: 'unsubscribe' }>;

/**
 * Receives every event of every root stream subscription. It runs in the
 * stream's injector (so it can `inject`), must not throw (a throwing observer
 * is ignored, never allowed to break the stream) and cannot alter the stream.
 */
export type StreamTraceObserver = (
  event: StreamTraceEvent,
  context: StreamTraceContext,
) => void;

export function provideStreamTrace(observer: StreamTraceObserver): Provider {
  return { provide: STREAM_TRACE, useValue: observer, multi: true } as Provider;
}

/**
 * Errors a function wrapper already reported (and snapshotted) on their way
 * up: the root must not snapshot them a second time.
 */
const reportedDefects = new WeakSet<object>();

/** Reports a stage notification to the root subscription this context belongs to, if traced. */
export function emitStageTrace(
  context: StreamContext,
  event: Extract<StreamTraceEvent, { kind: 'stage' }>,
): void {
  context.trace?.(event);
}

export function ɵmarkDefectReported(error: unknown): void {
  if (typeof error === 'object' && error !== null) reportedDefects.add(error);
}

let streamSequence = 0;

function injectObservers(injector: Injector): readonly StreamTraceObserver[] {
  try {
    return (
      (injector.get(STREAM_TRACE as never, null as never) as unknown as
        | readonly StreamTraceObserver[]
        | null) ?? []
    );
  } catch {
    return [];
  }
}

function takeSnapshot(injector: Injector, error: unknown): void {
  if (isCraftControlFlow(error)) return;
  if (
    typeof error === 'object' &&
    error !== null &&
    reportedDefects.has(error)
  ) {
    return;
  }
  try {
    ɵinjectTakeAppSnapshotIn(injector)?.();
  } catch {
    // A snapshot callback must not replace the stream's own defect.
  }
}

function currentCorrelationId(injector: Injector): string | null {
  try {
    return runInInjectionContext(
      injector,
      () =>
        getCurrentStartCorrelationId() ??
        untracked(
          () =>
            ɵinjectCorrelationIdServiceIn(injector)?.lastCorrelationId() ??
            null,
        ),
    );
  } catch {
    return null;
  }
}

/**
 * Starts a root subscription through `start`, instrumented. `start` receives
 * the sink to hand to the stream; with no injector, in production, or with
 * nothing to observe, the original sink is passed through untouched.
 */
export function traceStreamRoot<A>(
  context: StreamContext,
  sink: StreamSink<A>,
  root: StreamTraceRoot,
  start: (sink: StreamSink<A>, context: StreamContext) => Unsubscribable,
): Unsubscribable {
  const injector = context.injector;
  if (!injector) return start(sink, context);

  let development = true;
  try {
    development =
      runInInjectionContext(injector, () => ɵinjectCraftRuntimeMode()) !==
      'production';
  } catch {
    development = true;
  }
  if (!development) return start(sink, context);

  const observers = injectObservers(injector);
  const traceContext: StreamTraceContext | undefined =
    observers.length > 0
      ? {
          streamId: `stream#${++streamSequence}`,
          name: context.name,
          root,
          startCorrelationId: currentCorrelationId(injector),
        }
      : undefined;

  const emit = (event: StreamTraceEvent) => {
    if (!traceContext) return;
    for (const observer of observers) {
      try {
        runInInjectionContext(injector, () => observer(event, traceContext));
      } catch {
        // Observers are passive.
      }
    }
  };

  let settled = false;
  let index = 0;

  const traced: StreamSink<A> = {
    get closed() {
      return sink.closed;
    },
    next: (value) => {
      emit({ kind: 'next', value, index: index++ });
      sink.next(value);
    },
    exception: (exception) => {
      settled = true;
      emit({ kind: 'exception', exception });
      sink.exception(exception);
    },
    error: (error) => {
      settled = true;
      emit({ kind: 'error', error });
      takeSnapshot(injector, error);
      sink.error(error);
    },
    complete: () => {
      settled = true;
      emit({ kind: 'complete' });
      sink.complete();
    },
  };

  // A derived context (prototype chain keeps the lazy getters) so a context
  // shared by several subscriptions never mixes their stage events.
  const tracedContext: StreamContext = traceContext
    ? Object.create(context, { trace: { value: emit } })
    : context;

  emit({ kind: 'subscribe' });
  const subscription = start(traced, tracedContext);
  return {
    unsubscribe: () => {
      if (!settled) {
        settled = true;
        emit({ kind: 'unsubscribe' });
      }
      subscription.unsubscribe();
    },
  };
}
