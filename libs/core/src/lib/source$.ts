import {
  DestroyRef,
  EventEmitter,
  inject,
  Signal,
  signal,
} from '@angular/core';

export type SourceSubscribe<T> = {
  subscribe: (
    callback: (value: T) => void,
  ) => ReturnType<EventEmitter<T>['subscribe']>;
};

export type Source$<T> = {
  emit: (value: T) => void;
  subscribe: (
    callback: (value: T) => void,
  ) => ReturnType<EventEmitter<T>['subscribe']>;
  asReadonly: () => ReadonlySource$<T>;
  preserveLastValue: () => {
    emit: (value: T) => void;
    subscribe: (callback: (value: T) => void) => void;
    asReadonly: () => {
      subscribe: (callback: (value: T) => void) => void;
      value: Signal<T | undefined>;
    };
    value: Signal<T | undefined>;
  };
  value: Signal<T | undefined>;
};

export type ReadonlySource$<T> = {
  subscribe: (
    callback: (value: T) => void,
  ) => ReturnType<EventEmitter<T>['subscribe']>;
  value: Signal<T | undefined>;
};

/**
 * Creates an event emitter with automatic cleanup and signal-based value tracking.
 *
 * `source$` provides a lightweight event streaming solution that combines event emission,
 * automatic subscription cleanup via `DestroyRef`, and signal-based reactive value tracking.
 *
 * @template T - The type of values emitted by the source
 *
 * @returns {Source$<T>} An object with the following methods and properties:
 * - `emit(value: T)` - Emits a value to all subscribers and updates the internal signal
 * - `subscribe(callback: (value: T) => void)` - Subscribes to emissions with automatic cleanup
 * - `value: Signal<T | undefined>` - A read-only signal containing the last emitted value
 * - `asReadonly()` - Returns a read-only version (only `subscribe` and `value`)
 * - `preserveLastValue()` - Returns a variant that immediately emits the last value to new subscribers
 *
 * @example
 * Basic usage with state coordination
 * ```typescript
 * import { source$, state, on$ } from '@craft-ng/core';
 *
 * @Component({
 *   selector: 'app-counter',
 *   template: `
 *     <p>Count: {{ counter() }}</p>
 *     <button (click)="counter.increment()">+1</button>
 *     <button (click)="reset$.emit()">Reset</button>
 *   `,
 * })
 * export class CounterComponent {
 *   reset$ = source$<void>();
 *
 *   counter = state(0, ({ set, update }) => ({
 *     increment: () => update((v) => v + 1),
 *     reset: on$(this.reset$, () => set(0)),
 *   }));
 * }
 * ```
 *
 *
 * @example
 * Late subscriber with preserved last value
 * ```typescript
 * const notifications$ = source$<string>().preserveLastValue();
 *
 * notifications$.emit('Server started');
 * notifications$.emit('Database connected');
 *
 * // Late subscriber receives the last value immediately
 * notifications$.subscribe((msg) => {
 *   console.log(msg); // 'Database connected'
 * });
 * ```
 *
 * @example
 * Read-only access pattern
 * ```typescript
 * class DataService {
 *   private dataUpdated$ = source$<Data>();
 *   readonly dataUpdated = this.dataUpdated$.asReadonly();
 *
 *   updateData(data: Data) {
 *     this.dataUpdated$.emit(data);
 *   }
 * }
 * ```
 *
 * @see {@link https://ng-craft.dev/utils/source$ | source$ documentation}
 */
export function source$<T>(): Source$<T> {
  const sourceRef$ = new EventEmitter<T>();
  const destroyRef = inject(DestroyRef);

  const sourceAsSignal = signal<T | undefined>(undefined);

  return {
    emit: (value: T) => {
      sourceRef$.emit(value);
      sourceAsSignal.set(value);
    },
    subscribe: (callback: (value: T) => void) => sourceRef$.subscribe(callback),
    preserveLastValue: () => {
      const sourceWithLastValueRef = new EventEmitter<T>();
      const subscriptionWithLastLastValue = sourceRef$.subscribe((value) => {
        sourceWithLastValueRef.emit(value);
      });

      destroyRef.onDestroy(() => subscriptionWithLastLastValue.unsubscribe());

      return {
        emit: (value: T) => {
          sourceWithLastValueRef.emit(value);
          sourceAsSignal.set(value);
        },
        subscribe: (callback: (value: T) => void) => {
          sourceWithLastValueRef.subscribe(callback);
          sourceWithLastValueRef.emit(sourceAsSignal());
        },
        asReadonly: () => ({
          subscribe: (callback: (value: T) => void) => {
            sourceWithLastValueRef.subscribe(callback);
            sourceWithLastValueRef.emit(sourceAsSignal());
          },
          value: sourceAsSignal.asReadonly(),
        }),
        value: sourceAsSignal.asReadonly(),
      };
    },
    value: sourceAsSignal.asReadonly(),
    asReadonly: () => ({
      subscribe: (callback: (value: T) => void) =>
        sourceRef$.subscribe(callback),
      value: sourceAsSignal.asReadonly(),
    }),
  };
}
