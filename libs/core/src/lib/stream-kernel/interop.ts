import {
  DestroyRef,
  asCraftInjector,
  inject,
  type InjectorHandle,
  type Signal,
} from '../host/craft-compat';
import { craftWatch } from '../host/craft-signal';
import { TemporalCancelledError } from '../temporal-runtime';
import type { Subscribable, Unsubscribable } from './subscribable';

/** Rejection of {@link firstValueFrom} when the source completes empty. */
export class EmptyStreamError extends Error {
  constructor() {
    super('The stream completed without emitting a value.');
    this.name = 'EmptyStreamError';
  }
}

export type ValueFromOptions<D> = { defaultValue: D };

/**
 * Resolves with the first value `source` emits (the first one satisfying
 * `predicate`, when given), then unsubscribes. Rejects with the source's
 * `exception`/`error` payload, or with {@link EmptyStreamError} if it completes
 * first — unless `{ defaultValue }` is given, which an empty source resolves to.
 * (An RxJS-style `{ defaultValue }` config is accepted in place of a predicate.)
 */
export function firstValueFrom<T>(
  source: Subscribable<T>,
  predicate?: (value: T) => boolean,
): Promise<T>;
export function firstValueFrom<T, D>(
  source: Subscribable<T>,
  options: ValueFromOptions<D>,
): Promise<T | D>;
export function firstValueFrom<T>(
  source: Subscribable<T>,
  predicateOrOptions?: ((value: T) => boolean) | ValueFromOptions<unknown>,
): Promise<unknown> {
  const predicate =
    typeof predicateOrOptions === 'function' ? predicateOrOptions : undefined;
  const options =
    typeof predicateOrOptions === 'object' ? predicateOrOptions : undefined;

  return new Promise<unknown>((resolve, reject) => {
    let settled = false;
    // Assigned after `settle`, which unsubscribes it once the source answered.
    // eslint-disable-next-line prefer-const
    let subscription: Unsubscribable | undefined;

    const settle = (action: () => void) => {
      if (settled) return;
      settled = true;
      action();
      subscription?.unsubscribe();
    };

    const observer = {
      next: (value: T) => {
        if (!predicate || predicate(value)) settle(() => resolve(value));
      },
      error: (error: unknown) => settle(() => reject(error)),
      exception: (exception: unknown) => settle(() => reject(exception)),
      complete: () =>
        settle(() =>
          options
            ? resolve(options.defaultValue)
            : reject(new EmptyStreamError()),
        ),
    };

    subscription = source.subscribe(observer);
    // The source may have settled synchronously, before `subscription` existed.
    if (settled) subscription.unsubscribe();
  });
}

/**
 * Resolves with the last value `source` emitted once it completes. Rejects with
 * the source's `exception`/`error` payload, or with {@link EmptyStreamError} if
 * it completes empty — unless `{ defaultValue }` is given.
 */
export function lastValueFrom<T>(source: Subscribable<T>): Promise<T>;
export function lastValueFrom<T, D>(
  source: Subscribable<T>,
  options: ValueFromOptions<D>,
): Promise<T | D>;
export function lastValueFrom<T>(
  source: Subscribable<T>,
  options?: ValueFromOptions<unknown>,
): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    let last: { value: T } | undefined;
    source.subscribe({
      next: (value: T) => {
        last = { value };
      },
      error: reject,
      exception: reject,
      complete: () => {
        if (last) resolve(last.value);
        else if (options) resolve(options.defaultValue);
        else reject(new EmptyStreamError());
      },
    } as Parameters<Subscribable<T>['subscribe']>[0]);
  });
}

export type SignalChangesOptions = {
  injector?: InjectorHandle;
};

/**
 * Cold stream of a signal's values: emits the current value on subscription,
 * then every change. Completes when the ambient (or given) injector is
 * destroyed.
 */
export function signalChanges<T>(
  source: Signal<T>,
  options?: SignalChangesOptions,
): Subscribable<T> {
  return {
    subscribe(observer) {
      let closed = false;

      const start = () => {
        const watch = craftWatch(() => {
          const value = source();
          if (!closed) observer.next?.(value);
        });
        let release: (() => void) | undefined;
        try {
          const destroyRef = inject(DestroyRef, { optional: true });
          release = destroyRef?.onDestroy(() => {
            watch.destroy();
            if (!closed) {
              closed = true;
              observer.complete?.();
            }
          });
        } catch {
          release = undefined;
        }
        return () => {
          closed = true;
          release?.();
          watch.destroy();
        };
      };

      const stop = options?.injector
        ? asCraftInjector(options.injector).run(start)
        : start();

      return { unsubscribe: stop };
    },
  };
}

/**
 * Resolves once `source` is `true`. Destroying the injector before then rejects
 * with {@link TemporalCancelledError} instead of leaving the caller pending.
 */
export function waitUntilTrue(
  source: Signal<boolean>,
  injector: InjectorHandle,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const craftInjector = asCraftInjector(injector);
    let watch: { destroy(): void } | undefined;
    let release: (() => void) | undefined;
    let done = false;

    const finish = (action: () => void) => {
      if (done) return;
      done = true;
      release?.();
      watch?.destroy();
      action();
    };

    try {
      craftInjector.run(() => {
        const destroyRef = inject(DestroyRef, { optional: true });
        release = destroyRef?.onDestroy(() =>
          finish(() => reject(new TemporalCancelledError())),
        );
        watch = craftWatch(() => {
          if (source()) finish(resolve);
        });
        // `finish` may have run synchronously, before `watch` was assigned.
        if (done) watch.destroy();
      });
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

/**
 * Ends `source` for the subscriber when `destroyRef` (or the ambient one) is
 * destroyed.
 */
export function untilDestroyed<T>(
  source: Subscribable<T>,
  destroyRef?: DestroyRef,
): Subscribable<T> {
  const ref = destroyRef ?? inject(DestroyRef, { optional: true });
  return {
    subscribe(observer) {
      const subscription = source.subscribe(observer);
      const release = ref?.onDestroy(() => subscription.unsubscribe());
      return {
        unsubscribe() {
          release?.();
          subscription.unsubscribe();
        },
      };
    },
  };
}
