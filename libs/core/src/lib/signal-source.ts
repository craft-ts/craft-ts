import { linkedSignal, Signal, signal, ValueEqualityFn } from '@angular/core';
import { SourceBranded } from './util/util';

export type SignalSource<T> = Signal<T | undefined> & {
  set: (value: T) => void;
  preserveLastValue: Signal<T | undefined>;
} & SourceBranded;

/**
 * Creates a source for event-driven communication with lazy emission semantics.
 *
 * Sources are the foundation of event-driven patterns in ng-craft, enabling:
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
 * @param options - Optional configuration:
 *   - `equal`: Custom equality function for change detection (prevents duplicate emissions)
 *   - `debugName`: Name for debugging purposes
 *
 * @returns A source object with:
 *   - `()`: Read current value (undefined until first emission)
 *   - `set(value)`: Emit a value to all listeners
 *   - `preserveLastValue`: Alternative signal that returns last value immediately
 *
 * @example
 * Basic source for user actions
 * ```ts
 * const { injectUserStore } = craftService(
 *   { name: 'UserStore', scope: 'toProvide' },
 *   () => {
 *     const loadUser = signalSource<string>();
 *
 *     const user = query({
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
 * const store = injectUserStore();
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
 * const { injectFormStore } = craftService(
 *   { name: 'FormStore', scope: 'toProvide' },
 *   () => {
 *     const submitForm = signalSource<FormData>();
 *
 *     const submit = mutation({
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
 * const store = injectFormStore();
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
 * const { injectDataStore } = craftService(
 *   { name: 'DataStore', scope: 'toProvide' },
 *   () => {
 *     const reload = signalSource<void>();
 *
 *     const data = query({
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
 * const store = injectDataStore();
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
 * const { injectTodoStore } = craftService(
 *   { name: 'TodoStore', scope: 'toProvide' },
 *   () => {
 *     const addTodo = signalSource<{ text: string }>();
 *     const deleteTodo = signalSource<string>();
 *     const toggleTodo = signalSource<string>();
 *
 *     const create = mutation({
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
 *     const remove = mutation({
 *       method: afterRecomputation(deleteTodo, (id) => id),
 *       loader: async ({ params }) => {
 *         await fetch(`/api/todos/${params}`, { method: 'DELETE' });
 *         return { deleted: true };
 *       },
 *     });
 *
 *     const toggle = mutation({
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
 * const store = injectTodoStore();
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
 * const mySource = signalSource<string>();
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
 * const paramsSource = signalSource<Params>({
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
 * // Global source (outside any component/service)
 * const refreshAllSource = signalSource<void>();
 *
 * // Component A's store
 * const { injectDataViewStore, provideDataViewStore } = craftService(
 *   { name: 'DataViewStore', scope: 'toProvide' },
 *   () => {
 *     const data = query({
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
 *   store = injectDataViewStore();
 * }
 *
 * // Component B
 * @Component({
 *   selector: 'app-refresh-button',
 *   template: '<button (click)="refresh()">Refresh All</button>',
 * })
 * export class RefreshButtonComponent {
 *   refresh() {
 *     // Triggers refresh in every store listening to this source
 *     refreshAllSource.set();
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
 * const { injectSearchStore } = craftService(
 *   { name: 'SearchStore', scope: 'toProvide' },
 *   () => {
 *     const search = signalSource<SearchParams>();
 *
 *     const results = query({
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
 * const store = injectSearchStore();
 *
 * // Emit complex search parameters
 * store.search.set({
 *   query: 'angular',
 *   filters: ['tutorial', 'advanced'],
 *   page: 1,
 * });
 * ```
 */
export function signalSource<T>(options?: {
  equal?: ValueEqualityFn<NoInfer<T> | undefined>;
  debugName?: string;
}): SignalSource<T> {
  const sourceState = signal<T | undefined>(undefined, {
    ...(options?.equal && { equal: options?.equal }), // add the equal function here, it may helps to detect changes when using scalar values
    ...(options?.debugName && {
      debugName: options?.debugName + '_sourceState',
    }),
  });

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
      ...(options?.debugName && { debugName: options?.debugName }),
    });
  return Object.assign(
    listener({
      nullishFirstValue: true,
    }),
    {
      preserveLastValue: listener({
        nullishFirstValue: false,
      }),
      set: sourceState.set,
    },
    SourceBranded,
  ) as SignalSource<T>;
}
