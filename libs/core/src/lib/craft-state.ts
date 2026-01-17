import {
  ContextConstraints,
  craftFactoryEntries,
  CraftFactoryEntries,
  CraftFactoryUtility,
  partialContext,
  PartialContext,
  StoreConfigConstraints,
} from './craft';
import { StateOutput } from './state';
import { isSignal, Signal } from '@angular/core';
import { capitalize } from './util/util';
import { DeferredExtract } from './util/util.type';

type SpecificCraftStateOutputs<StateName extends string, State, Insertions> =
  DeferredExtract<Insertions> extends infer Extracted
    ? Extracted extends { props: unknown; methods: Record<string, Function> }
      ? PartialContext<{
          props: {
            [key in StateName]: Signal<State>;
          } & {
            [key in keyof Extracted['props'] as `${StateName &
              string}${Capitalize<key & string>}`]: Extracted['props'][key];
          };
          methods: {
            [key in keyof Extracted['methods'] as `${StateName &
              string}${Capitalize<key & string>}`]: Extracted['methods'][key];
          };
        }>
      : never
    : never;

type CraftStateOutputs<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  StateName extends string,
  State,
  Insertions,
> = CraftFactoryUtility<
  Context,
  StoreConfig,
  SpecificCraftStateOutputs<StateName, State, Insertions>
>;

/**
 * Creates a state definition for use within a craft store, enabling reactive state management with optional custom methods and computed values.
 *
 * This function integrates a `state()` instance into a craft store by:
 * - Registering the state under a specific name in the store
 * - Automatically prefixing custom methods and computed values with the state name
 * - Providing type-safe access to state, methods, and computed properties
 * - Enabling reactive connections to sources, inputs, and other store states
 * - Supporting insertions for extended functionality
 *
 * @remarks
 * **Naming Convention:**
 * - The state is accessible as `store.stateName` (returns the Signal)
 * - Custom methods are prefixed: `store.stateNameMethodName`
 * - Computed values are prefixed: `store.stateNameComputedName`
 *
 * **Use Cases:**
 * - **Local UI state**: Form values, filters, pagination, modal visibility
 * - **Derived state**: Computed values based on state changes
 * - **Coordinated state**: State that reacts to other states or sources
 * - **Encapsulated logic**: State with associated behavior methods
 *
 * **Integration:**
 * - Access to other craft entries (sources, queries, mutations) via context
 * - Can react to sources using `afterRecomputation()`
 * - Supports all state() insertion features (persistence, validation, etc.)
 *
 * @template Context - The craft store context type
 * @template StoreConfig - The craft store configuration type
 * @template StateName - The name of the state (must be a literal string)
 * @template State - The type of the state value
 * @template Insertions - The accumulated outputs from state insertions
 *
 * @param stateName - The name under which this state will be registered in the store.
 *   Used as prefix for all methods and computed values.
 * @param stateFactory - Factory function that receives the craft context and returns a state() instance.
 *   Has access to all other craft entries (sources, queries, mutations, states) defined before it.
 *
 * @returns A craft factory utility that integrates the state into the store with:
 *   - `store.stateName`: Signal returning the current state value
 *   - `store.stateNameMethodName`: Prefixed custom methods from insertions
 *   - `store.stateNameComputedName`: Prefixed computed signals from insertions
 *
 * @example
 * Basic state without methods
 * ```ts
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftState('counter', () => state(0))
 * );
 *
 * const store = injectCraft();
 *
 * // Access the state
 * console.log(store.counter()); // 0
 *
 * // Update the state
 * store.counter.set(5);
 * console.log(store.counter()); // 5
 * ```
 *
 * @example
 * State with custom methods
 * ```ts
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftState('todos', () =>
 *     state(
 *       [] as Todo[],
 *       ({ state, set }) => ({
 *         add: (todo: Todo) => {
 *           set([...state(), todo]);
 *         },
 *         remove: (id: string) => {
 *           set(state().filter(t => t.id !== id));
 *         },
 *         clear: () => {
 *           set([]);
 *         },
 *       })
 *     )
 *   )
 * );
 *
 * const store = injectCraft();
 *
 * // Use prefixed methods
 * store.todosAdd({ id: '1', text: 'Buy milk', done: false });
 * store.todosAdd({ id: '2', text: 'Walk dog', done: false });
 * console.log(store.todos().length); // 2
 *
 * store.todosRemove('1');
 * console.log(store.todos().length); // 1
 *
 * store.todosClear();
 * console.log(store.todos().length); // 0
 * ```
 *
 * @example
 * State with computed values
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'CartStore', providedIn: 'root' },
 *   craftState('items', () =>
 *     state(
 *       [] as CartItem[],
 *       ({ state, set }) => ({
 *         add: (item: CartItem) => {
 *           set([...state(), item]);
 *         },
 *         // Computed values are also prefixed
 *         count: computed(() => state().length),
 *         total: computed(() =>
 *           state().reduce((sum, item) => sum + item.price * item.quantity, 0)
 *         ),
 *         isEmpty: computed(() => state().length === 0),
 *       })
 *     )
 *   )
 * );
 *
 * const store = injectCraft();
 *
 * // Access computed values with prefixed names
 * console.log(store.itemsCount()); // 0
 * console.log(store.itemsIsEmpty()); // true
 *
 * store.itemsAdd({ id: '1', name: 'Book', price: 15, quantity: 2 });
 * console.log(store.itemsCount()); // 1
 * console.log(store.itemsTotal()); // 30
 * console.log(store.itemsIsEmpty()); // false
 * ```
 *
 * @example
 * State reacting to sources
 * ```ts
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftSources({
 *     resetFilters: source<void>(),
 *   }),
 *   craftState('filters', ({ resetFilters }) =>
 *     state(
 *       { search: '', category: 'all', priceRange: [0, 1000] },
 *       ({ state, set }) => ({
 *         setSearch: (search: string) => {
 *           set({ ...state(), search });
 *         },
 *         setCategory: (category: string) => {
 *           set({ ...state(), category });
 *         },
 *         // React to source to reset state
 *         reset: afterRecomputation(resetFilters, () => {
 *           set({ search: '', category: 'all', priceRange: [0, 1000] });
 *         }),
 *       })
 *     )
 *   )
 * );
 *
 * const store = injectCraft();
 *
 * // Use the state
 * store.filtersSetSearch('laptop');
 * store.filtersSetCategory('electronics');
 * console.log(store.filters()); // { search: 'laptop', category: 'electronics', ... }
 *
 * // Reset via source
 * store.setResetFilters();
 * console.log(store.filters()); // { search: '', category: 'all', ... }
 * ```
 *
 * @example
 * State coordinating with multiple sources
 * ```ts
 * const globalReset = source<string>();
 *
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftSources({
 *     localReset: source<string>(),
 *   }),
 *   craftState('pageState', ({ localReset }) =>
 *     state(
 *       { page: 1, items: [] as string[] },
 *       ({ state, set }) => ({
 *         addItem: (item: string) => {
 *           set({ ...state(), items: [...state().items, item] });
 *         },
 *         nextPage: () => {
 *           set({ ...state(), page: state().page + 1 });
 *         },
 *         // React to local source
 *         localReset: afterRecomputation(localReset, (reason) => {
 *           console.log('Local reset:', reason);
 *           set({ page: 1, items: [] });
 *         }),
 *         // React to global source
 *         globalReset: afterRecomputation(globalReset, (reason) => {
 *           console.log('Global reset:', reason);
 *           set({ page: 1, items: ['default'] });
 *         }),
 *       })
 *     )
 *   )
 * );
 *
 * const store = injectCraft();
 *
 * store.pageStateAddItem('item1');
 * store.pageStateAddItem('item2');
 * console.log(store.pageState().items); // ['item1', 'item2']
 *
 * store.setLocalReset('User action');
 * console.log(store.pageState().items); // []
 *
 * globalReset.set('System reset');
 * console.log(store.pageState().items); // ['default']
 * ```
 *
 * @example
 * State with persistence
 * ```ts
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftState('preferences', () =>
 *     state(
 *       { theme: 'light', language: 'en', notifications: true },
 *       insertLocalStoragePersister({
 *         storeName: 'SettingsStore',
 *         key: 'preferences',
 *         cacheTime: Number.POSITIVE_INFINITY, // Never expire
 *       })
 *     )
 *   )
 * );
 *
 * const store = injectCraft();
 *
 * // Preferences are automatically persisted and restored
 * store.preferences.set({ theme: 'dark', language: 'fr', notifications: false });
 * // On next app load, preferences are automatically restored
 * ```
 *
 * @example
 * Multiple states in one store
 * ```ts
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftState('ui', () =>
 *     state({ sidebarOpen: false, modalOpen: false })
 *   ),
 *   craftState('user', () =>
 *     state({ isAuthenticated: false, userId: null as string | null })
 *   ),
 *   craftState('notifications', () =>
 *     state([] as Notification[])
 *   )
 * );
 *
 * const store = injectCraft();
 *
 * // Access different states
 * console.log(store.ui()); // { sidebarOpen: false, modalOpen: false }
 * console.log(store.user()); // { isAuthenticated: false, userId: null }
 * console.log(store.notifications()); // []
 *
 * // Update independently
 * store.ui.set({ sidebarOpen: true, modalOpen: false });
 * store.user.set({ isAuthenticated: true, userId: 'user-123' });
 * ```
 */
export function craftState<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  const StateName extends string,
  State,
  Insertions,
>(
  stateName: StateName,
  stateFactory: (
    context: CraftFactoryEntries<Context>,
  ) => StateOutput<State, Insertions>,
): CraftStateOutputs<Context, StoreConfig, StateName, State, Insertions> {
  return () => (contextData) => {
    const stateResult = stateFactory(craftFactoryEntries(contextData));

    const { props, methods } = Object.entries(stateResult).reduce(
      (acc, [key, value]) => {
        if (isSignal(value)) {
          (acc.props as Record<string, Signal<any>>)[
            `${stateName}${capitalize(key)}`
          ] = value;
        } else {
          (acc.methods as Record<string, Function>)[
            `${stateName}${capitalize(key)}`
          ] = value;
        }
        return acc;
      },
      {
        props: {},
        methods: {},
      } as {
        props: Record<string, Signal<any>>;
        methods: Record<string, Function>;
      },
    );
    return partialContext({
      props: { [stateName]: stateResult, ...props },
      methods,
    }) as unknown as SpecificCraftStateOutputs<StateName, State, Insertions>;
  };
}
