import {
  assertInInjectionContext,
  DestroyRef,
  inject,
  Injector,
  linkedSignal,
  runInInjectionContext,
  Signal,
  signal,
  ValueEqualityFn,
} from './host/craft-compat';
import { takeUntilDestroyed } from './host/craft-compat';
import { SourceBranded } from './util/util';
import { ɵcreateHostTaggedInjector, ɵHOST_TAG_LIST } from './craft-service';
import { APP_SNAPSHOT_REGISTRY } from './take-app-snapshot';
import { injectFnWrapper } from './fn-wrapper';
import {
  RAW_REACTIVE_VALUE,
  REACTIVE_VALUE_TYPE,
  YIELDABLE_VALUE,
  type ReactiveReadRequest,
  type YieldableReactiveValue,
} from './reactive-read';

type YieldableSignalSourceValue<T> = YieldableReactiveValue<
  T | undefined,
  string
>;

type YieldableSignalSourceMetadata<T> = Omit<
  YieldableSignalSourceValue<T>,
  | typeof RAW_REACTIVE_VALUE
  | typeof REACTIVE_VALUE_TYPE
  | typeof YIELDABLE_VALUE
> & {
  readonly [RAW_REACTIVE_VALUE]: YieldableSignalSourceValue<T>[typeof RAW_REACTIVE_VALUE];
  readonly [REACTIVE_VALUE_TYPE]: T | undefined;
  readonly [YIELDABLE_VALUE]: string;
};

type SignalSourceReader<T> = {
  (): T | undefined;
  (): Generator<ReactiveReadRequest<T | undefined>, T | undefined, unknown>;
} & YieldableSignalSourceMetadata<T>;

export type SignalSource<T> = SignalSourceReader<T> & {
  set: (value: T) => void;
  preserveLastValue: SignalSourceReader<T>;
} & SourceBranded;

/**
 * Creates a source for event-driven communication with lazy emission semantics.
 *
 * Sources are the foundation of event-driven patterns in craft-ts, enabling:
 * - Discrete event emissions (unlike continuous signals)
 * - Lazy behavior (undefined until explicitly set)
 * - Decoupled communication between components and stores
 * - Automatic triggering of queries, mutations, and async methods
 * - Multi-listener support with independent subscription timing
 *
 * @remarks
 * **Core Concept:**
 * Sources implement event emitter pattern with reactive semantics:
 * - Emit only when explicitly set (not on every read like signals)
 * - Listeners receive `undefined` on first read (lazy semantics)
 * - New listeners don't receive previous emissions by default
 * - Use `preserveLastValue` to get the last emitted value immediately
 *
 * **Difference from Signals:**
 * - **Signals**: Always have a value, recompute on access, continuous state
 * - **Sources**: Emit on explicit set, lazy by default, discrete events
 * - Sources are for events/actions, signals are for state
 *
 * **Use Cases:**
 * - **User actions**: Button clicks, form submissions, custom events
 * - **Navigation events**: Route changes, tab switches
 * - **Data events**: Reload triggers, refresh requests
 * - **Coordination**: Communication between disconnected components
 * - **Store inputs**: Triggering queries/mutations from components
 * - **Event buses**: Decoupled event communication
 *
 * **Integration with Queries/Mutations:**
 * - Bind to method using `afterRecomputation(source, callback)`
 * - Query/mutation executes automatically when source emits
 * - No manual method exposed (source-based triggering)
 *
 * **Listener Semantics:**
 * - **Standard listener**: Returns `undefined` until source emits, then returns new values only
 * - **preserveLastValue**: Returns last emitted value immediately, then tracks new values
 * - Useful for late subscribers that need current state
 *
 * **Limitations:**
 * Sources are signals and behave differently from observables.
 * Understanding these three key limitations is important:
 * - **Multiple sets in same cycle**: When a source is set multiple times during the same cycle
 *   (between the first set and the Change Detection that executes all consumer callbacks),
 *   consumers will only react once during CD and will only see the last set value.
 *   Intermediate values are discarded.
 * - **Multiple sources order**: Within the same cycle, if multiple sources are triggered,
 *   consumers cannot determine the order in which the sources were set.
 *   The original emission sequence is not preserved.
 * - **Consumer execution order**: When multiple sources are triggered in the same cycle,
 *   consumer callbacks are invoked in the order they were declared, not in the order
 *   their source producers were triggered.
 * - **No synchronous intermediate value reactions**: Unlike observables, sources cannot react
 *   to each intermediate value synchronously. A mechanism similar to observables
 *   (or using native Observable API) without RxJS is being considered to enable
 *   synchronous reactions to intermediate values, matching the behavior currently
 *   offered by observables.
 *
 * @template T - The type of values emitted by the source
 *
 * @param name - Name matching the variable/property this source is assigned to (used for host
 * tagging and dev-tools snapshot reporting, consistent with `craftComputed`/`craftEffect`)
 * @param options - Optional configuration:
 *   - `equal`: Custom equality function for change detection (prevents duplicate emissions)
 *
 * @returns A source object with:
 *   - `()`: Read current value (undefined until first emission)
 *   - `set(value)`: Emit a value to all listeners
 *   - `preserveLastValue`: Alternative signal that returns last value immediately
 *
 * @example
 * Basic source for user actions
 * ```ts
 * const { UserStore } = craftService(
 *   { name: 'UserStore', providedIn: 'toProvide' },
 *   function* () {
 *     const loadUser = signalSource<string>('loadUser');
 *
 *     const user = yield* query({
 *       method: afterRecomputation(loadUser, (userId) => userId),
 *       loader: async ({ params }) => {
 *         const response = await fetch(`/api/users/${params}`);
 *         return response.json();
 *       },
 *     });
 *
 *     return { loadUser, user };
 *   },
 * );
 *
 * const store = UserStore();
 *
 * // Query executes automatically when source emits
 * store.loadUser.set('user-123');
 * // -> loadUser source emits 'user-123'
 * // -> user query executes with params 'user-123'
 *
 * store.loadUser.set('user-456');
 * // -> user query executes again with params 'user-456'
 * ```
 *
 * @example
 * Source for form submission
 * ```ts
 * type FormData = { name: string; email: string };
 *
 * const { FormStore } = craftService(
 *   { name: 'FormStore', providedIn: 'toProvide' },
 *   function* () {
 *     const submitForm = signalSource<FormData>('submitForm');
 *
 *     const submit = yield* mutation({
 *       method: afterRecomputation(submitForm, (data) => data),
 *       loader: async ({ params }) => {
 *         const response = await fetch('/api/submit', {
 *           method: 'POST',
 *           body: JSON.stringify(params),
 *         });
 *         return response.json();
 *       },
 *     });
 *
 *     return { submitForm, submit };
 *   },
 * );
 *
 * const store = FormStore();
 *
 * // In component template:
 * // <form (submit)="onSubmit()">
 * //   <input name="name" [(ngModel)]="formData.name" />
 * //   <input name="email" [(ngModel)]="formData.email" />
 * // </form>
 *
 * onSubmit() {
 *   // Mutation executes automatically
 *   this.store.submitForm.set(this.formData);
 *   // -> submitForm source emits
 *   // -> submit mutation executes
 * }
 * ```
 *
 * @example
 * Source for reload/refresh actions
 * ```ts
 * const { DataStore } = craftService(
 *   { name: 'DataStore', providedIn: 'toProvide' },
 *   function* () {
 *     const reload = signalSource<void>('reload');
 *
 *     const data = yield* query({
 *       method: afterRecomputation(reload, () => ({})),
 *       loader: async () => {
 *         const response = await fetch('/api/data');
 *         return response.json();
 *       },
 *     });
 *
 *     return { reload, data };
 *   },
 * );
 *
 * const store = DataStore();
 *
 * // Trigger reload from anywhere
 * store.reload.set();
 * // -> reload source emits
 * // -> query re-executes
 *
 * // In component:
 * // <button (click)="store.reload.set()">Refresh</button>
 * ```
 *
 * @example
 * Multiple sources for different actions
 * ```ts
 * const { TodoStore } = craftService(
 *   { name: 'TodoStore', providedIn: 'toProvide' },
 *   function* () {
 *     const addTodo = signalSource<{ text: string }>('addTodo');
 *     const deleteTodo = signalSource<string>('deleteTodo');
 *     const toggleTodo = signalSource<string>('toggleTodo');
 *
 *     const create = yield* mutation({
 *       method: afterRecomputation(addTodo, (data) => data),
 *       loader: async ({ params }) => {
 *         const response = await fetch('/api/todos', {
 *           method: 'POST',
 *           body: JSON.stringify(params),
 *         });
 *         return response.json();
 *       },
 *     });
 *
 *     const remove = yield* mutation({
 *       method: afterRecomputation(deleteTodo, (id) => id),
 *       loader: async ({ params }) => {
 *         await fetch(`/api/todos/${params}`, { method: 'DELETE' });
 *         return { deleted: true };
 *       },
 *     });
 *
 *     const toggle = yield* mutation({
 *       method: afterRecomputation(toggleTodo, (id) => id),
 *       loader: async ({ params }) => {
 *         const response = await fetch(`/api/todos/${params}/toggle`, {
 *           method: 'PATCH',
 *         });
 *         return response.json();
 *       },
 *     });
 *
 *     return { addTodo, deleteTodo, toggleTodo, create, remove, toggle };
 *   },
 * );
 *
 * const store = TodoStore();
 *
 * // Different actions trigger different mutations
 * store.addTodo.set({ text: 'Buy milk' });
 * store.toggleTodo.set('todo-123');
 * store.deleteTodo.set('todo-456');
 * ```
 *
 * @example
 * Late listener with preserveLastValue
 * ```ts
 * // Inside a component constructor or a craftService factory (injection context)
 * const mySource = signalSource<string>('mySource');
 *
 * // Early listener
 * const listener1 = computed(() => mySource());
 * console.log(listener1()); // undefined
 *
 * // Emit value
 * mySource.set('Hello');
 * console.log(listener1()); // 'Hello'
 *
 * // Late listener (after emission)
 * const listener2 = computed(() => mySource());
 * console.log(listener2()); // undefined (doesn't get previous emission)
 *
 * mySource.set('World');
 * console.log(listener1()); // 'World'
 * console.log(listener2()); // 'World'
 *
 * // Using preserveLastValue for late listeners
 * const listener3 = computed(() => mySource.preserveLastValue());
 * console.log(listener3()); // 'World' (gets last value immediately)
 * ```
 *
 * @example
 * Custom equality to prevent duplicate emissions
 * ```ts
 * type Params = { id: string; timestamp: number };
 *
 * // Inside a component constructor or a craftService factory (injection context)
 * const paramsSource = signalSource<Params>('paramsSource', {
 *   equal: (a, b) => a?.id === b?.id, // Compare only by id
 * });
 *
 * const listener = computed(() => paramsSource());
 *
 * paramsSource.set({ id: 'item-1', timestamp: Date.now() });
 * // -> listener receives value
 *
 * paramsSource.set({ id: 'item-1', timestamp: Date.now() });
 * // -> listener does NOT receive value (same id)
 *
 * paramsSource.set({ id: 'item-2', timestamp: Date.now() });
 * // -> listener receives value (different id)
 * ```
 *
 * @example
 * Source for coordinating multiple components
 * ```ts
 * // Root-provided coordinator service, injected wherever the shared source is needed
 * const { RefreshCoordinator } = craftService(
 *   { name: 'RefreshCoordinator', scope: 'root' },
 *   () => {
 *     const refreshAllSource = signalSource<void>('refreshAllSource');
 *     return { refreshAllSource };
 *   },
 * );
 *
 * // Component A's store
 * const { DataViewStore, provideDataViewStore } = craftService(
 *   { name: 'DataViewStore', providedIn: 'toProvide' },
 *   function* () {
 *     const { refreshAllSource } = RefreshCoordinator();
 *
 *     const data = yield* query({
 *       method: afterRecomputation(refreshAllSource, () => ({})),
 *       loader: async () => {
 *         const response = await fetch('/api/data');
 *         return response.json();
 *       },
 *     });
 *
 *     return { data };
 *   },
 * );
 *
 * @Component({
 *   selector: 'app-data-view',
 *   template: '...',
 *   providers: [provideDataViewStore()],
 * })
 * export class DataViewComponent {
 *   store = DataViewStore();
 * }
 *
 * // Component B
 * @Component({
 *   selector: 'app-refresh-button',
 *   template: '<button (click)="refresh()">Refresh All</button>',
 * })
 * export class RefreshButtonComponent {
 *   private readonly coordinator = RefreshCoordinator();
 *
 *   refresh() {
 *     // Triggers refresh in every store listening to this source
 *     this.coordinator.refreshAllSource.set();
 *   }
 * }
 * ```
 *
 * @example
 * Source with complex payload
 * ```ts
 * type SearchParams = {
 *   query: string;
 *   filters: string[];
 *   page: number;
 * };
 *
 * const { SearchStore } = craftService(
 *   { name: 'SearchStore', providedIn: 'toProvide' },
 *   function* () {
 *     const search = signalSource<SearchParams>('search');
 *
 *     const results = yield* query({
 *       method: afterRecomputation(search, (params) => params),
 *       loader: async ({ params }) => {
 *         const queryString = new URLSearchParams({
 *           q: params.query,
 *           filters: params.filters.join(','),
 *           page: String(params.page),
 *         });
 *         const response = await fetch(`/api/search?${queryString}`);
 *         return response.json();
 *       },
 *     });
 *
 *     return { search, results };
 *   },
 * );
 *
 * const store = SearchStore();
 *
 * // Emit complex search parameters
 * store.search.set({
 *   query: 'angular',
 *   filters: ['tutorial', 'advanced'],
 *   page: 1,
 * });
 * ```
 */
export function signalSource<T>(
  name: string,
  options?: {
    equal?: ValueEqualityFn<NoInfer<T> | undefined>;
  },
): SignalSource<T> {
  assertInInjectionContext(signalSource);
  const injector = inject(Injector);
  const sourceInjector = ɵcreateHostTaggedInjector(
    injector,
    `signal-source:${name}`,
  );
  const destroyRef = inject(DestroyRef);

  const sourceState = signal<T | undefined>(undefined, {
    ...(options?.equal && { equal: options?.equal }), // add the equal function here, it may helps to detect changes when using scalar values
    debugName: `${name}_sourceState`,
  });

  const wrappedSet = runInInjectionContext(sourceInjector, () =>
    injectFnWrapper()((value: T) => sourceState.set(value)),
  );
  const set = (value: T) =>
    runInInjectionContext(sourceInjector, () => wrappedSet(value));

  const listener = (listenerOptions: { nullishFirstValue?: boolean }) =>
    linkedSignal<T, T | undefined>({
      source: sourceState as Signal<T>,
      computation: (currentSourceState, previousData) => {
        // always when first listened return undefined
        if (!previousData && listenerOptions?.nullishFirstValue !== false) {
          return undefined;
        }
        return currentSourceState;
      },
      ...(options?.equal && { equal: options?.equal }),
      debugName: name,
    });

  const result = listener({
    nullishFirstValue: true,
  });

  const registry = inject(APP_SNAPSHOT_REGISTRY, { optional: true });
  if (registry) {
    const from = sourceInjector.get(ɵHOST_TAG_LIST, null) ?? [];
    registry.triggerSnapshot$
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => {
        let stateSnapshot: unknown;
        try {
          stateSnapshot = result();
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

  return Object.assign(
    result,
    {
      preserveLastValue: listener({
        nullishFirstValue: false,
      }),
      set,
    },
    SourceBranded,
  ) as unknown as SignalSource<T>;
}
