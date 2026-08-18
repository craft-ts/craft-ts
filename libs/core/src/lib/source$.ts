import {
  assertInInjectionContext,
  DestroyRef,
  EventEmitter,
  inject,
  Injector,
  Signal,
  signal,
} from './host/craft-compat';
import { takeUntilDestroyed } from './host/craft-compat';
import { ɵcreateHostTaggedInjector, ɵHOST_TAG_LIST } from './craft-service';
import { APP_SNAPSHOT_REGISTRY } from './take-app-snapshot';
import type {
  SERVICE_HELPER_DEPENDENCIES,
  ServiceDependencies,
} from './craft-service';
import {
  createNamedPrimitiveGen,
  type NamedCraftPrimitiveGen,
} from './craft-primitive-gen';

export type SourceDependency<Name extends string> = {
  [K in Name]: ServiceDependencies<'function', {}>;
};

type SourceDependencyCarrier<Name extends string> = {
  readonly [SERVICE_HELPER_DEPENDENCIES]?: SourceDependency<Name>;
};

export type SourceSubscribe<T> = {
  subscribe: (
    callback: (value: T) => void,
  ) => ReturnType<EventEmitter<T>['subscribe']>;
};

export type SourceInstance<
  T,
  Name extends string = string,
> = SourceDependencyCarrier<Name> & {
  emit: (value: T) => void;
  subscribe: (
    callback: (value: T) => void,
  ) => ReturnType<EventEmitter<T>['subscribe']>;
  asReadonly: () => ReadonlySource$<T, Name>;
  preserveLastValue: () => PreservedSource$<T, Name>;
  value: Signal<T | undefined>;
};

export type Source$<T, Name extends string = string> = SourceInstance<T, Name> &
  NamedCraftPrimitiveGen<Name, SourceInstance<T, Name>>;

export type PreservedSource$<
  T,
  Name extends string = string,
> = SourceDependencyCarrier<Name> & {
  emit: (value: T) => void;
  subscribe: (callback: (value: T) => void) => void;
  asReadonly: () => ReadonlySource$<T, Name>;
  value: Signal<T | undefined>;
};

export type ReadonlySource$<
  T,
  Name extends string = string,
> = SourceDependencyCarrier<Name> & {
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
 * @param name - Name matching the variable/property this source is assigned to (used for host
 * tagging and dev-tools snapshot reporting, consistent with `craftComputed`/`craftEffect`)
 *
 * @returns {Source$<T>} A source object that is also a named primitive
 * generator. Use it directly with `emit()`/`subscribe()`, or consume it with
 * `yield*` to obtain `{ [name]: source }` and propagate its dependency metadata.
 * - `emit(value: T)` - Emits a value to all subscribers and updates the internal signal
 * - `subscribe(callback: (value: T) => void)` - Subscribes to emissions with automatic cleanup
 * - `value: Signal<T | undefined>` - A read-only signal containing the last emitted value
 * - `asReadonly()` - Returns a read-only version (only `subscribe` and `value`)
 * - `preserveLastValue()` - Returns a variant that immediately emits the last value to new subscribers
 *
 * @example
 * Yieldable source service
 * ```typescript
 * const { Reset } = craftService(
 *   { name: 'Reset', scope: 'global' },
 *   function* () {
 *     const reset$ = yield* source$<void>('reset$');
 *     return reset$;
 *   },
 * );
 *
 * const reset = yield* Reset();
 * reset.emit();
 * ```
 *
 * @example
 * Basic usage with state coordination
 * ```typescript
 * import { source$, state, on$ } from '@craft-ts/core';
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
 *   reset$ = source$<void>('reset$');
 *
 *   counter = craftUse(state(0, ({ set, update }) => ({
 *     increment: () => update((v) => v + 1),
 *     reset: on$(this.reset$, () => set(0)),
 *   })));
 * }
 * ```
 *
 *
 * @example
 * Late subscriber with preserved last value
 * ```typescript
 * const notifications$ = source$<string>('notifications$').preserveLastValue();
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
 *   private dataUpdated$ = source$<Data>('dataUpdated$');
 *   readonly dataUpdated = this.dataUpdated$.asReadonly();
 *
 *   updateData(data: Data) {
 *     this.dataUpdated$.emit(data);
 *   }
 * }
 * ```
 *
 * @see {@link https://craft-ts.dev/utils/source$ | source$ documentation}
 */
export function source$<T, Name extends string = string>(
  name: Name,
): Source$<T, Name> {
  assertInInjectionContext(source$);
  const injector = inject(Injector);
  const sourceInjector = ɵcreateHostTaggedInjector(injector, `source:${name}`);

  const sourceRef$ = new EventEmitter<T>();
  const destroyRef = inject(DestroyRef);

  const sourceAsSignal = signal<T | undefined>(undefined);

  const registry = inject(APP_SNAPSHOT_REGISTRY, { optional: true });
  if (registry) {
    const from = sourceInjector.get(ɵHOST_TAG_LIST, null) ?? [];
    registry.triggerSnapshot$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => {
        let stateSnapshot: unknown;
        try {
          stateSnapshot = sourceAsSignal();
        } catch (error) {
          stateSnapshot = {
            error: error instanceof Error ? error.message : String(error),
          };
        }
        registry.allSnapShot$.next({
          source: name,
          from,
          state: stateSnapshot,
        });
      });
  }

  const source = {
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
          sourceWithLastValueRef.emit(sourceAsSignal() as T);
        },
        asReadonly: () => ({
          subscribe: (callback: (value: T) => void) => {
            sourceWithLastValueRef.subscribe(callback);
            sourceWithLastValueRef.emit(sourceAsSignal() as T);
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
  } as SourceInstance<T, Name>;

  const generator = createNamedPrimitiveGen(name, source);

  return Object.assign(generator, source) as Source$<T, Name>;
}
