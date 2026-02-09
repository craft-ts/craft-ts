import {
  ContextConstraints,
  CraftFactoryUtility,
  PartialContext,
  partialContext,
  StoreConfigConstraints,
} from './craft';
import { SignalSource } from './signal-source';
import { capitalize } from './util/util';

// todo expose standalone methods
// todo Context['sources'] & Context['queryParams'] & Context['asyncMethods'];

type InferSourceType<S> = S extends SignalSource<infer T> ? T : never;

export type SourceSetterMethods<Sources extends {}> = {
  [K in keyof Sources as `set${Capitalize<string & K>}`]: (
    payload: InferSourceType<Sources[K]>,
  ) => void;
};

type SpecificCraftSourcesOutputs<Sources extends {}> = PartialContext<{
  methods: SourceSetterMethods<Sources>;
  _sources: Sources;
}>;

type CraftSourcesOutputs<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  Inputs extends {},
> = CraftFactoryUtility<
  Context,
  StoreConfig,
  SpecificCraftSourcesOutputs<Inputs>,
  SourceSetterMethods<Inputs>
>;

/**
 * Creates source definitions for use within a craft store, enabling reactive signal-source-driven communication.
 *
 * This function integrates `source()` instances into a craft store by:
 * - Registering multiple sources with their names as keys
 * - Automatically generating setter methods with `set` prefix for each source
 * - Providing type-safe access to sources and their setter methods
 * - Enabling reactive patterns where states and queries can react to source emissions
 * - Exposing standalone setter methods that can be called outside injection context
 *
 * @remarks
 * **Naming Convention:**
 * - Sources are accessible via context: `context.sourceName`
 * - Setter methods are prefixed: `store.setSourceName(payload)`
 * - Standalone methods: Available directly from craft return: `setSourceName(payload)`
 *
 * **Use Cases:**
 * - **Event broadcasting**: Trigger actions across multiple parts of the store
 * - **User interactions**: Button clicks, form submissions, navigation events
 * - **Lifecycle events**: Component mount/unmount, route changes
 * - **Cross-component communication**: Coordinate behavior without tight coupling
 * - **Reset mechanisms**: Trigger state resets or data refreshes
 *
 * **Reactive Patterns:**
 * - States can react to sources using `afterRecomputation()`
 * - Mutations can be bound to sources for automatic execution
 * - Multiple consumers can react to the same source emission
 *
 * **Standalone Methods:**
 * - Setter methods can be called outside Angular's injection context
 * - Useful for event handlers, callbacks, or external integrations
 * - No need to inject the store to trigger source emissions
 *
 * @template Context - The craft store context type
 * @template StoreConfig - The craft store configuration type
 * @template Sources - Record of source names to Source instances
 *
 * @param sources - Object mapping source names to Source instances.
 *   Each source can emit values of a specific type.
 *
 * @returns A craft factory utility that:
 *   - Makes sources accessible in context for other craft entries
 *   - Adds prefixed setter methods to the store: `store.setSourceName(payload)`
 *   - Exposes standalone setter functions: `setSourceName(payload)` (can be called outside injection context)
 *
 * @example
 * Basic sources with state reactions
 * ```ts
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftSources({
 *     increment: source<void>(),
 *     decrement: source<void>(),
 *     reset: source<number>(), // Can pass a reset value
 *   }),
 *   craftState('count', ({ increment, decrement, reset }) =>
 *     state(
 *       0,
 *       ({ state, set }) => ({
 *         // React to increment source
 *         increment: afterRecomputation(increment, () => {
 *           set(state() + 1);
 *         }),
 *         // React to decrement source
 *         decrement: afterRecomputation(decrement, () => {
 *           set(state() - 1);
 *         }),
 *         // React to reset with payload
 *         reset: afterRecomputation(reset, (value) => {
 *           set(value);
 *         }),
 *       })
 *     )
 *   )
 * );
 *
 * const store = injectCraft();
 *
 * // Use setter methods from store
 * store.setIncrement(); // count: 1
 * store.setIncrement(); // count: 2
 * store.setDecrement(); // count: 1
 * store.setReset(10); // count: 10
 * ```
 *
 * @example
 * Standalone methods outside injection context
 * ```ts
 * const { injectCraft, setRefresh, setError } = craft(
 *   { name: 'DataStore', providedIn: 'root' },
 *   craftSources({
 *     refresh: source<void>(),
 *     error: source<string>(),
 *   }),
 *   craftState('data', ({ refresh }) =>
 *     state(
 *       null,
 *       ({ set }) => ({
 *         refresh: afterRecomputation(refresh, async () => {
 *           const data = await fetchData();
 *           set(data);
 *         }),
 *       })
 *     )
 *   )
 * );
 *
 * // Can be called outside component/injection context
 * document.addEventListener('visibilitychange', () => {
 *   if (!document.hidden) {
 *     setRefresh(); // No injection context needed!
 *   }
 * });
 *
 * // Use in error handlers
 * window.addEventListener('error', (e) => {
 *   setError(e.message);
 * });
 * ```
 *
 * @example
 * Complex coordination across multiple states
 * ```ts
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftSources({
 *     logout: source<void>(),
 *     clearFilters: source<void>(),
 *   }),
 *   craftState('user', ({ logout }) =>
 *     state(
 *       { isAuthenticated: true, userId: 'user-123' },
 *       ({ set }) => ({
 *         logout: afterRecomputation(logout, () => {
 *           set({ isAuthenticated: false, userId: null });
 *         }),
 *       })
 *     )
 *   ),
 *   craftState('filters', ({ clearFilters, logout }) =>
 *     state(
 *       { search: '', category: 'all' },
 *       ({ set }) => ({
 *         // React to specific clear source
 *         clear: afterRecomputation(clearFilters, () => {
 *           set({ search: '', category: 'all' });
 *         }),
 *         // Also clear on logout
 *         logout: afterRecomputation(logout, () => {
 *           set({ search: '', category: 'all' });
 *         }),
 *       })
 *     )
 *   ),
 *   craftState('cache', ({ logout }) =>
 *     state(
 *       new Map(),
 *       ({ set }) => ({
 *         logout: afterRecomputation(logout, () => {
 *           set(new Map()); // Clear cache on logout
 *         }),
 *       })
 *     )
 *   )
 * );
 *
 * const store = injectCraft();
 *
 * // Single source emission affects multiple states
 * store.setLogout();
 * // -> user state is reset
 * // -> filters are cleared
 * // -> cache is emptied
 * ```
 *
 * @example
 * Sources with typed payloads
 * ```ts
 * type FilterUpdate = {
 *   field: string;
 *   value: unknown;
 * };
 *
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftSources({
 *     updateFilter: source<FilterUpdate>(),
 *     sortBy: source<{ column: string; direction: 'asc' | 'desc' }>(),
 *     pageChange: source<number>(),
 *   }),
 *   craftState('tableState', ({ updateFilter, sortBy, pageChange }) =>
 *     state(
 *       { filters: {}, sort: null, page: 1 },
 *       ({ state, set }) => ({
 *         updateFilter: afterRecomputation(updateFilter, ({ field, value }) => {
 *           set({
 *             ...state(),
 *             filters: { ...state().filters, [field]: value },
 *           });
 *         }),
 *         sortBy: afterRecomputation(sortBy, (sortConfig) => {
 *           set({ ...state(), sort: sortConfig });
 *         }),
 *         pageChange: afterRecomputation(pageChange, (page) => {
 *           set({ ...state(), page });
 *         }),
 *       })
 *     )
 *   )
 * );
 *
 * const store = injectCraft();
 *
 * // Type-safe source emissions
 * store.setUpdateFilter({ field: 'status', value: 'active' });
 * store.setSortBy({ column: 'name', direction: 'asc' });
 * store.setPageChange(2);
 * ```
 *
 * @example
 * Sources triggering mutations
 * ```ts
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftSources({
 *     createTodo: source<{ text: string }>(),
 *     deleteTodo: source<string>(),
 *   }),
 *   craftMutations(() => ({
 *     create: mutation({
 *       method: afterRecomputation(
 *         inject('createTodo'), // Access source from context
 *         (data) => data
 *       ),
 *       loader: async ({ params }) => {
 *         const response = await fetch('/api/todos', {
 *           method: 'POST',
 *           body: JSON.stringify(params),
 *         });
 *         return response.json();
 *       },
 *     }),
 *   }))
 * );
 *
 * const store = injectCraft();
 *
 * // Source emission triggers mutation automatically
 * store.setCreateTodo({ text: 'Buy milk' });
 * // -> mutation executes automatically
 * ```
 *
 * @example
 * Multiple sources for different reset scenarios
 * ```ts
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftSources({
 *     softReset: source<void>(), // Clear form but keep draft
 *     hardReset: source<void>(), // Clear everything
 *     loadDraft: source<FormData>(),
 *   }),
 *   craftState('form', ({ softReset, hardReset, loadDraft }) =>
 *     state(
 *       { data: {}, draft: null, isDirty: false },
 *       ({ state, set }) => ({
 *         softReset: afterRecomputation(softReset, () => {
 *           set({ ...state(), data: {}, isDirty: false });
 *         }),
 *         hardReset: afterRecomputation(hardReset, () => {
 *           set({ data: {}, draft: null, isDirty: false });
 *         }),
 *         loadDraft: afterRecomputation(loadDraft, (draft) => {
 *           set({ ...state(), data: draft, isDirty: false });
 *         }),
 *       })
 *     )
 *   )
 * );
 *
 * const store = injectCraft();
 *
 * store.setSoftReset(); // Clears form, keeps draft
 * store.setHardReset(); // Clears everything
 * store.setLoadDraft({ name: 'John', email: 'john@example.com' }); // Load draft
 * ```
 */
export function craftSources<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  Sources extends Record<string, SignalSource<any>>,
>(sources: Sources): CraftSourcesOutputs<Context, StoreConfig, Sources> {
  const methods = Object.entries(sources).reduce(
    (acc, [key, source]) => {
      return {
        ...acc,
        [`set${capitalize(key)}`]: (payload: unknown) => {
          source.set(payload);
        },
      };
    },
    {} as Record<string, (payload: unknown) => void>,
  );
  return (() =>
    Object.assign((contextData: ContextConstraints) => {
      return partialContext({
        _sources: sources,
        methods,
      }) as SpecificCraftSourcesOutputs<Sources>;
    }, methods) as unknown as CraftSourcesOutputs<
      Context,
      StoreConfig,
      Sources
    >) as unknown as CraftSourcesOutputs<Context, StoreConfig, Sources>;
}
