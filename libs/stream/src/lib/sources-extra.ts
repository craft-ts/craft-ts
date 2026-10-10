import {
  isObservableLike,
  type Subscribable,
  type Unsubscribable,
} from '@craft-ts/core';
import {
  createCraftStream,
  isCraftStream,
  STREAM_RUN,
  type CraftStream,
} from './craft-stream';

type PromiseLikeOf<A> = PromiseLike<A>;

/**
 * Emits the value `promise` resolves to, then completes. A rejection is a
 * **defect** (the `error` channel): a Promise has no typed failure.
 */
export function fromPromise<A>(
  promise: PromiseLikeOf<A>,
): CraftStream<A, never> {
  return createCraftStream<A, never>((_context, sink) => {
    let cancelled = false;
    promise.then(
      (value) => {
        if (cancelled || sink.closed) return;
        sink.next(value);
        sink.complete();
      },
      (error) => {
        if (!cancelled) sink.error(error);
      },
    );
    return {
      unsubscribe() {
        cancelled = true;
      },
    };
  });
}

/** Emits the items of `iterable` in order, then completes. */
export function fromIterable<A>(iterable: Iterable<A>): CraftStream<A, never> {
  return createCraftStream<A, never>((_context, sink) => {
    for (const item of iterable) {
      if (sink.closed) return;
      sink.next(item);
    }
    sink.complete();
  });
}

/**
 * Lifts whatever it is given: a craft stream (as is), a `Subscribable` (an RxJS
 * Observable, a core subject), a Promise-like, or an iterable (an array, a Set…).
 */
export function from<A, Y>(input: CraftStream<A, Y>): CraftStream<A, Y>;
export function from<A>(input: Subscribable<A>): CraftStream<A, never>;
export function from<A>(input: PromiseLikeOf<A>): CraftStream<A, never>;
export function from<A>(input: Iterable<A>): CraftStream<A, never>;
export function from(input: unknown): CraftStream<unknown, unknown> {
  if (isCraftStream(input)) return input;
  if (isObservableLike(input)) {
    return createCraftStream<unknown, unknown>((_context, sink) =>
      (input as Subscribable<unknown>).subscribe({
        next: (value) => sink.next(value),
        error: (error) => sink.error(error),
        exception: (exception: unknown) => sink.exception(exception),
        complete: () => sink.complete(),
      } as Parameters<Subscribable<unknown>['subscribe']>[0]),
    );
  }
  if (
    typeof input === 'object' &&
    input !== null &&
    typeof (input as { then?: unknown }).then === 'function'
  ) {
    return fromPromise(input as PromiseLike<unknown>);
  }
  if (
    typeof input === 'object' &&
    input !== null &&
    typeof (input as { [Symbol.iterator]?: unknown })[Symbol.iterator] ===
      'function'
  ) {
    return fromIterable(input as Iterable<unknown>);
  }
  return createCraftStream<unknown, unknown>((_context, sink) => {
    sink.error(
      new Error('from(...): expected a stream, a promise or an iterable.'),
    );
  });
}

export type GenerateOptions<S, A> = {
  initialState: S;
  /** Keep going while it returns `true` (default: forever). */
  condition?: (state: S) => boolean;
  iterate: (state: S) => S;
  /** What to emit for a state (default: the state itself). */
  resultSelector?: (state: S) => A;
};

/**
 * Emits a sequence produced by iterating a state — a loop as a stream. A
 * synchronous source: with no `condition` it never ends, so bound it with
 * `take`, `takeWhile` or `takeUntil` (it stops as soon as its consumer does).
 */
export function generate<S, A = S>(
  options: GenerateOptions<S, A>,
): CraftStream<A, never> {
  return createCraftStream<A, never>((_context, sink) => {
    let state = options.initialState;
    while (!sink.closed && (options.condition?.(state) ?? true)) {
      sink.next(
        (options.resultSelector
          ? options.resultSelector(state)
          : state) as unknown as A,
      );
      if (sink.closed) return;
      state = options.iterate(state);
    }
    sink.complete();
  });
}

/**
 * Turns a callback-style function into one returning a stream: the callback's
 * arguments are emitted once (a single argument as is, several as an array),
 * then the stream completes. The function runs on each subscription.
 */
export function bindCallback<Args extends unknown[], R extends unknown[]>(
  fn: (...args: [...Args, (...results: R) => void]) => unknown,
): (...args: Args) => CraftStream<R extends [infer Only] ? Only : R, never> {
  return (...args) =>
    createCraftStream((_context, sink) => {
      fn(...args, (...results: R) => {
        if (sink.closed) return;
        sink.next((results.length === 1 ? results[0] : results) as never);
        sink.complete();
      });
    });
}

/**
 * Like {@link bindCallback} for Node-style callbacks (`(error, ...results)`): a
 * non-nullish `error` ends the stream with a **defect**.
 */
export function bindNodeCallback<Args extends unknown[], R extends unknown[]>(
  fn: (...args: [...Args, (error: unknown, ...results: R) => void]) => unknown,
): (...args: Args) => CraftStream<R extends [infer Only] ? Only : R, never> {
  return (...args) =>
    createCraftStream((_context, sink) => {
      fn(...args, (error: unknown, ...results: R) => {
        if (sink.closed) return;
        if (error !== null && error !== undefined) {
          sink.error(error);
          return;
        }
        sink.next((results.length === 1 ? results[0] : results) as never);
        sink.complete();
      });
    });
}

/**
 * Performs a `fetch` and emits its `Response`, then completes. Unsubscribing
 * aborts the request. A network failure is a **defect**; an HTTP error status
 * is NOT a failure here (the `Response` carries it) — decide in the pipe.
 *
 * Application HTTP belongs to `query` / `mutation` / server functions; this is
 * the stream-shaped primitive for the cases that really are a stream.
 */
export function fromFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): CraftStream<Response, never> {
  return createCraftStream<Response, never>((_context, sink) => {
    const controller = new AbortController();
    fetch(input, { ...init, signal: controller.signal }).then(
      (response) => {
        if (sink.closed) return;
        sink.next(response);
        sink.complete();
      },
      (error) => {
        if (!controller.signal.aborted) sink.error(error);
      },
    );
    return { unsubscribe: () => controller.abort() };
  });
}

/** Never emits and never completes. */
export function never(): CraftStream<never, never> {
  return createCraftStream<never, never>(() => undefined);
}

/**
 * Terminates with a **defect** (the `error` channel), like RxJS's `throwError`:
 * an unexpected failure, never catchable by `catchTag`. For a typed failure use
 * `fail(craftException(...))`. A function argument is called once per
 * subscription.
 */
export function throwError(
  error: unknown | (() => unknown),
): CraftStream<never, never> {
  return createCraftStream<never, never>((_context, sink) => {
    sink.error(
      typeof error === 'function' ? (error as () => unknown)() : error,
    );
  });
}

/**
 * Builds the stream at subscription time: `factory` runs once per subscriber,
 * so each one gets a fresh stream. The factory may return a craft stream (its
 * dependencies and exceptions join the result) or a plain `Subscribable`.
 */
export function defer<A, Y>(
  factory: () => CraftStream<A, Y>,
): CraftStream<A, Y>;
export function defer<A>(factory: () => Subscribable<A>): CraftStream<A, never>;
export function defer(
  factory: () => Subscribable<unknown>,
): CraftStream<unknown, unknown> {
  return createCraftStream<unknown, unknown>((context, sink) => {
    const inner = factory();
    if (isCraftStream(inner)) return inner[STREAM_RUN](context, sink);
    if (!isObservableLike(inner)) {
      sink.error(new Error('defer: the factory must return a stream.'));
      return;
    }
    return (inner as Subscribable<unknown>).subscribe({
      next: (value) => sink.next(value),
      error: (error) => sink.error(error),
      exception: (exception: unknown) => sink.exception(exception),
      complete: () => sink.complete(),
    } as Parameters<Subscribable<unknown>['subscribe']>[0]) as Unsubscribable;
  });
}

/** Emits `count` consecutive integers starting at `start`, then completes. */
export function range(start: number, count: number): CraftStream<number, never> {
  return createCraftStream<number, never>((_context, sink) => {
    for (let n = 0; n < count; n += 1) {
      if (sink.closed) return;
      sink.next(start + n);
    }
    sink.complete();
  });
}

/**
 * Subscribes to `whenTrue` or `whenFalse` depending on `condition`, evaluated at
 * each subscription. The result's `Y` covers both branches. A missing branch is
 * an empty stream.
 */
export function iif<A, YA, B = never, YB = never>(
  condition: () => boolean,
  whenTrue: CraftStream<A, YA>,
  whenFalse?: CraftStream<B, YB>,
): CraftStream<A | B, YA | YB> {
  return createCraftStream<unknown, unknown>((context, sink) => {
    let chosen: CraftStream<unknown, unknown> | undefined;
    try {
      chosen = (condition() ? whenTrue : whenFalse) as
        | CraftStream<unknown, unknown>
        | undefined;
    } catch (error) {
      sink.error(error);
      return;
    }
    if (!chosen) {
      sink.complete();
      return;
    }
    return chosen[STREAM_RUN](context, sink);
  }) as never;
}
