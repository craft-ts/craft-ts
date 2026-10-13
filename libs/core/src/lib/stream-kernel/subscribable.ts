// ---------------------------------------------------------------------------
// Stream kernel — the minimal push-based contract core needs to stay
// independent of RxJS. It is purely structural: an RxJS `Observable` is
// assignable to `Subscribable`, so interop costs nothing, but core never
// imports a reactive-stream library.
//
// No operator and no generic pipe live here. The typed operator library is
// `@craft-ts/stream`, which depends on core and therefore cannot be imported
// back from it.
// ---------------------------------------------------------------------------

/** Handle returned by a subscription. */
export interface Unsubscribable {
  unsubscribe(): void;
}

/** The three RxJS-compatible notification channels. */
export interface Observer<T> {
  next: (value: T) => void;
  error: (error: unknown) => void;
  complete: () => void;
}

/**
 * Observer with the extra **typed exception** channel. `exception` is terminal
 * like `error`, but carries the producer's declared failure set; `error` stays
 * reserved for defects (unexpected throws). A subscriber without an
 * `exception` handler receives exceptions through `error`.
 */
export interface StreamObserver<T, E = unknown> extends Observer<T> {
  exception: (exception: E) => void;
}

/** Anything that can be subscribed to — structurally an RxJS `Subscribable`. */
export interface Subscribable<T> {
  subscribe(observer: Partial<Observer<T>>): Unsubscribable;
}

export function isObservableLike(
  value: unknown,
): value is Subscribable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { subscribe?: unknown }).subscribe === 'function'
  );
}

/** Routes an exception to `exception`, falling back to `error`. */
export function notifyException<T, E>(
  observer: Partial<StreamObserver<T, E>>,
  exception: E,
): void {
  if (observer.exception) {
    observer.exception(exception);
  } else {
    observer.error?.(exception);
  }
}

/**
 * The value type a {@link Subscribable} emits. Inferred from the observer
 * contract first; a source whose `subscribe` is overloaded (RxJS `Observable`)
 * only exposes `T` through its callback-style overload, so that shape is the
 * fallback.
 */
export type SubscribableValue<S> = S extends {
  subscribe(observer: Partial<Observer<infer Value>>): unknown;
}
  ? unknown extends Value
    ? S extends { subscribe(next: (value: infer Legacy) => void): unknown }
      ? Legacy
      : Value
    : Value
  : never;

/**
 * Resolves when `source` completes (values are ignored); rejects with its
 * `exception`/`error` payload. This is how an application initializer waits for
 * a stream-shaped result, exactly as it waits for a Promise.
 */
export function completionOf(source: Subscribable<unknown>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    source.subscribe({
      error: reject,
      exception: reject,
      complete: () => resolve(),
    } as Partial<StreamObserver<unknown>>);
  });
}
