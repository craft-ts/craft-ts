import { effect, signal, untracked, type Signal } from './host/craft-compat';
import { SignalSource } from './signal-source';
import { ReadonlySource } from './util/source.type';
import { SourceBranded } from './util/util';
import {
  ɵactiveMachineScope,
  ɵregisterMachineRecomputation,
} from './craft-state-machine-runtime';

/**
 * Creates a derived readonly source that transforms source emissions through a callback function.
 *
 * This function binds queries, mutations, and async methods to sources for automatic execution by:
 * - Listening to source emissions and computing new values
 * - Providing a readonly source suitable for method binding
 * - Maintaining reactivity through Angular's effect system
 * - Enabling source-based triggering patterns
 *
 * @remarks
 * **Primary Use Case:**
 * Bind queries/mutations/async methods to sources for automatic execution:
 * ```ts
 * method: afterRecomputation(mySource, (data) => data)
 * ```
 * This pattern makes queries/mutations execute automatically when the source emits.
 *
 * **Execution Flow:**
 * 1. Source emits a value via `source.set(value)`
 * 2. afterRecomputation callback transforms the value
 * 3. Resulting readonly source emits the transformed value
 * 4. Bound query/mutation/async method executes with the new value
 *
 * **Difference from computedSource:**
 * - `afterRecomputation`: Designed for binding to method parameters
 * - `computedSource`: General-purpose source transformation
 * - Both transform source values, but afterRecomputation is optimized for method binding
 *
 * **Common Patterns:**
 * - **Identity transformation**: `afterRecomputation(source, (x) => x)` - pass value through
 * - **Field extraction**: `afterRecomputation(source, (data) => data.id)` - extract specific field
 * - **Validation**: `afterRecomputation(source, (data) => validate(data))` - transform and validate
 * - **Mapping**: `afterRecomputation(source, (data) => mapToDto(data))` - convert to different type
 *
 * @template State - The type of values produced by the callback
 * @template SourceType - The type of values emitted by the origin source
 *
 * @param _source - The source to listen to.
 *   When this source emits, the callback is invoked.
 *
 * @param callback - Function that transforms source values.
 *   Receives the emitted value and returns the transformed result.
 *
 * @returns A readonly source that emits transformed values.
 *   Can be used as the `method` parameter in queries, mutations, and async methods.
 *
 * @example
 * Binding a query to a source for automatic execution
 * ```ts
 * const { UserStore } = craftService(
 *   { name: 'UserStore', providedIn: 'toProvide' },
 *   function* () {
 *     const userIdChange = signalSource<string>('userIdChange');
 *
 *     const user = yield* query({
 *       method: afterRecomputation(userIdChange, (userId) => userId),
 *       loader: async ({ params }) => {
 *         const response = await fetch(`/api/users/${params}`);
 *         return response.json();
 *       },
 *     });
 *
 *     return { userIdChange, user };
 *   },
 * );
 *
 * const store = UserStore();
 *
 * // Query executes automatically when source emits
 * store.userIdChange.set('user-123');
 * // -> query loader executes with params 'user-123'
 *
 * store.userIdChange.set('user-456');
 * // -> query loader executes again with params 'user-456'
 * ```
 *
 * @example
 * Binding a mutation to a source
 * ```ts
 * const { FormStore } = craftService(
 *   { name: 'FormStore', providedIn: 'toProvide' },
 *   function* () {
 *     const submitForm = signalSource<{ name: string; email: string }>('submitForm');
 *
 *     const submit = yield* mutation({
 *       method: afterRecomputation(submitForm, (formData) => formData),
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
 * // Mutation executes automatically when source emits
 * store.submitForm.set({ name: 'John', email: 'john@example.com' });
 * // -> mutation loader executes with form data
 * // The mutation is driven by the source; store.submit.mutate() is unused here
 * ```
 *
 * @example
 * Binding an async process to a source
 * ```ts
 * const { SearchStore } = craftService(
 *   { name: 'SearchStore', providedIn: 'toProvide' },
 *   function* () {
 *     const searchInput = signalSource<string>('searchInput');
 *
 *     const search = yield* asyncProcess({
 *       method: afterRecomputation(searchInput, (term) => term),
 *       loader: async ({ params }) => {
 *         // Debounce at source level before setting
 *         const response = await fetch(`/api/search?q=${params}`);
 *         return response.json();
 *       },
 *     });
 *
 *     return { searchInput, search };
 *   },
 * );
 *
 * const store = SearchStore();
 *
 * // Async process executes automatically
 * store.searchInput.set('query');
 * // -> search loader executes
 * ```
 *
 * @example
 * Extracting specific field from complex data
 * ```ts
 * type FormData = {
 *   user: { id: string; name: string };
 *   address: { city: string };
 * };
 *
 * const { UserFormStore } = craftService(
 *   { name: 'UserFormStore', providedIn: 'toProvide' },
 *   function* () {
 *     const formSubmit = signalSource<FormData>('formSubmit');
 *
 *     const updateUser = yield* mutation({
 *       // Extract only user data
 *       method: afterRecomputation(formSubmit, (data) => data.user),
 *       loader: async ({ params }) => {
 *         const response = await fetch(`/api/users/${params.id}`, {
 *           method: 'PATCH',
 *           body: JSON.stringify(params),
 *         });
 *         return response.json();
 *       },
 *     });
 *
 *     return { formSubmit, updateUser };
 *   },
 * );
 *
 * const store = UserFormStore();
 *
 * // Only user data is passed to the mutation
 * store.formSubmit.set({
 *   user: { id: 'user-1', name: 'John' },
 *   address: { city: 'NYC' },
 * });
 * // -> mutation receives only { id: 'user-1', name: 'John' }
 * ```
 *
 * @example
 * Transforming data before execution
 * ```ts
 * const { ResultsStore } = craftService(
 *   { name: 'ResultsStore', providedIn: 'toProvide' },
 *   function* () {
 *     const searchParams = signalSource<{ query: string; filters: string[] }>('searchParams');
 *
 *     const results = yield* query({
 *       method: afterRecomputation(searchParams, (params) => ({
 *         q: params.query.trim().toLowerCase(),
 *         f: params.filters.join(','),
 *       })),
 *       loader: async ({ params }) => {
 *         const queryString = new URLSearchParams(params);
 *         const response = await fetch(`/api/search?${queryString}`);
 *         return response.json();
 *       },
 *     });
 *
 *     return { searchParams, results };
 *   },
 * );
 *
 * const store = ResultsStore();
 *
 * // Data is transformed before query execution
 * store.searchParams.set({
 *   query: '  Angular  ',
 *   filters: ['tutorial', 'advanced'],
 * });
 * // -> query receives { q: 'angular', f: 'tutorial,advanced' }
 * ```
 *
 * @example
 * Validation and type narrowing
 * ```ts
 * const { ValidationStore } = craftService(
 *   { name: 'ValidationStore', providedIn: 'toProvide' },
 *   function* () {
 *     const inputChange = signalSource<string>('inputChange');
 *
 *     const validate = yield* asyncProcess({
 *       method: afterRecomputation(inputChange, (input) => {
 *         // Only proceed if input is valid
 *         const trimmed = input.trim();
 *         if (trimmed.length < 3) {
 *           throw new Error('Input too short');
 *         }
 *         return trimmed;
 *       }),
 *       loader: async ({ params }) => {
 *         const response = await fetch('/api/validate', {
 *           method: 'POST',
 *           body: JSON.stringify({ input: params }),
 *         });
 *         return response.json();
 *       },
 *     });
 *
 *     return { inputChange, validate };
 *   },
 * );
 *
 * const store = ValidationStore();
 *
 * // Invalid input throws error in the callback
 * store.inputChange.set('ab'); // Error: Input too short
 *
 * // Valid input proceeds
 * store.inputChange.set('valid input'); // Validation executes
 * ```
 *
 * @example
 * Multiple sources with different transformations
 * ```ts
 * const { SearchResultsStore } = craftService(
 *   { name: 'SearchResultsStore', providedIn: 'toProvide' },
 *   function* () {
 *     const quickSearch = signalSource<string>('quickSearch');
 *     const advancedSearch = signalSource<{ query: string; options: unknown }>('advancedSearch');
 *
 *     const searchResults = yield* query({
 *       method: afterRecomputation(
 *         // Can combine sources at a higher level
 *         quickSearch, // For this example, using one source
 *         (term) => ({ query: term, mode: 'quick' }),
 *       ),
 *       loader: async ({ params }) => {
 *         const response = await fetch('/api/search', {
 *           method: 'POST',
 *           body: JSON.stringify(params),
 *         });
 *         return response.json();
 *       },
 *     });
 *
 *     return { quickSearch, advancedSearch, searchResults };
 *   },
 * );
 *
 * const store = SearchResultsStore();
 *
 * // Quick search with a simple string
 * store.quickSearch.set('angular');
 * // -> query receives { query: 'angular', mode: 'quick' }
 * ```
 *
 * @example
 * Identity transformation (pass-through)
 * ```ts
 * const { DataStore } = craftService(
 *   { name: 'DataStore', providedIn: 'toProvide' },
 *   function* () {
 *     const dataUpdate = signalSource<{ id: string; payload: unknown }>('dataUpdate');
 *
 *     const update = yield* mutation({
 *       // Pass data through unchanged
 *       method: afterRecomputation(dataUpdate, (data) => data),
 *       loader: async ({ params }) => {
 *         const response = await fetch(`/api/data/${params.id}`, {
 *           method: 'PUT',
 *           body: JSON.stringify(params.payload),
 *         });
 *         return response.json();
 *       },
 *     });
 *
 *     return { dataUpdate, update };
 *   },
 * );
 *
 * const store = DataStore();
 *
 * // Data passed through unchanged
 * store.dataUpdate.set({ id: 'item-1', payload: { value: 123 } });
 * // -> mutation receives the exact same object
 * ```
 */
export function afterRecomputation<State, SourceType>(
  _source: SignalSource<SourceType>,
  callback: (source: SourceType) => State,
): ReadonlySource<State>;
export function afterRecomputation<State, SourceType>(
  _source: ReadonlySource<SourceType>,
  callback: (source: SourceType) => State,
): ReadonlySource<State>;
export function afterRecomputation<State, SourceType>(
  _source: Signal<SourceType>,
  callback: (source: SourceType) => State,
): ReadonlySource<State>;
/**
 * Inside a `transitionStep(...)`, `afterRecomputation` is a machine
 * registration: every time the watched value recomputes, the callback runs
 * untracked with its declaring step restored, so the `transit(...)` attempts it
 * yields target that step. Consume it with `yield*` so the callback's
 * dependencies join the machine's dependency graph.
 */
export function afterRecomputation<Value, Yielded>(
  source: Signal<Value>,
  callback: (value: Value) => Generator<Yielded, unknown, unknown>,
): Generator<Yielded, void, unknown>;
export function afterRecomputation<State, SourceType>(
  _source:
    | SignalSource<SourceType>
    | ReadonlySource<SourceType>
    | Signal<SourceType>,
  callback: (source: SourceType) => State,
  // The machine overload resolves to a registration generator instead of a
  // readonly source, so the implementation signature stays deliberately loose.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  if (ɵactiveMachineScope()) {
    return ɵregisterMachineRecomputation(
      _source as unknown as Signal<unknown>,
      callback as (value: never) => unknown,
    ) as unknown as ReadonlySource<State>;
  }

  const source = _source as ReadonlySource<SourceType>;
  const initialValue = source();
  const derivedSource = signal<State | undefined>(
    initialValue && callback(initialValue),
  );
  const effectRef = effect(() => {
    const sourceValue = source();
    if (sourceValue !== undefined) {
      untracked(() => {
        const newState = callback(sourceValue);
        derivedSource.set(newState);
      });
    } else {
      derivedSource.set(undefined);
    }
  }, {});
  return Object.assign(
    derivedSource,
    SourceBranded,
  ) as unknown as ReadonlySource<State>;
}
