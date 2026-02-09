import { effect, signal, untracked } from '@angular/core';
import { SignalSource } from './signal-source';
import { ReadonlySource } from './util/source.type';
import { SourceBranded } from './util/util';

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
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftSources({
 *     userIdChange: source<string>(),
 *   }),
 *   craftQuery('user', ({ userIdChange }) =>
 *     query({
 *       method: afterRecomputation(userIdChange, (userId) => userId),
 *       loader: async ({ params }) => {
 *         const response = await fetch(`/api/users/${params}`);
 *         return response.json();
 *       },
 *     })
 *   )
 * );
 *
 * const store = injectCraft();
 *
 * // Query executes automatically when source emits
 * store.setUserIdChange('user-123');
 * // -> query loader executes with params 'user-123'
 *
 * store.setUserIdChange('user-456');
 * // -> query loader executes again with params 'user-456'
 * ```
 *
 * @example
 * Binding a mutation to a source
 * ```ts
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftSources({
 *     submitForm: source<{ name: string; email: string }>(),
 *   }),
 *   craftMutations(({ submitForm }) => ({
 *     submit: mutation({
 *       method: afterRecomputation(submitForm, (formData) => formData),
 *       loader: async ({ params }) => {
 *         const response = await fetch('/api/submit', {
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
 * // Mutation executes automatically when source emits
 * store.setSubmitForm({ name: 'John', email: 'john@example.com' });
 * // -> mutation loader executes with form data
 * // Note: No store.mutateSubmit method exposed (source-based)
 * ```
 *
 * @example
 * Binding async method to a source
 * ```ts
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftSources({
 *     searchInput: source<string>(),
 *   }),
 *   craftAsyncMethods(({ searchInput }) => ({
 *     search: asyncMethod({
 *       method: afterRecomputation(searchInput, (term) => term),
 *       loader: async ({ params }) => {
 *         // Debounce at source level before setting
 *         const response = await fetch(`/api/search?q=${params}`);
 *         return response.json();
 *       },
 *     }),
 *   }))
 * );
 *
 * const store = injectCraft();
 *
 * // Async method executes automatically
 * store.setSearchInput('query');
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
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftSources({
 *     formSubmit: source<FormData>(),
 *   }),
 *   craftMutations(({ formSubmit }) => ({
 *     updateUser: mutation({
 *       // Extract only user data
 *       method: afterRecomputation(formSubmit, (data) => data.user),
 *       loader: async ({ params }) => {
 *         const response = await fetch(`/api/users/${params.id}`, {
 *           method: 'PATCH',
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
 * // Only user data is passed to mutation
 * store.setFormSubmit({
 *   user: { id: 'user-1', name: 'John' },
 *   address: { city: 'NYC' },
 * });
 * // -> mutation receives only { id: 'user-1', name: 'John' }
 * ```
 *
 * @example
 * Transforming data before execution
 * ```ts
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftSources({
 *     searchParams: source<{ query: string; filters: string[] }>(),
 *   }),
 *   craftQuery('results', ({ searchParams }) =>
 *     query({
 *       method: afterRecomputation(searchParams, (params) => ({
 *         q: params.query.trim().toLowerCase(),
 *         f: params.filters.join(','),
 *       })),
 *       loader: async ({ params }) => {
 *         const query = new URLSearchParams(params);
 *         const response = await fetch(`/api/search?${query}`);
 *         return response.json();
 *       },
 *     })
 *   )
 * );
 *
 * const store = injectCraft();
 *
 * // Data is transformed before query execution
 * store.setSearchParams({
 *   query: '  Angular  ',
 *   filters: ['tutorial', 'advanced'],
 * });
 * // -> query receives { q: 'angular', f: 'tutorial,advanced' }
 * ```
 *
 * @example
 * Validation and type narrowing
 * ```ts
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftSources({
 *     inputChange: source<string>(),
 *   }),
 *   craftAsyncMethods(({ inputChange }) => ({
 *     validate: asyncMethod({
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
 *     }),
 *   }))
 * );
 *
 * const store = injectCraft();
 *
 * // Invalid input throws error in callback
 * store.setInputChange('ab'); // Error: Input too short
 *
 * // Valid input proceeds
 * store.setInputChange('valid input'); // Validation executes
 * ```
 *
 * @example
 * Multiple sources with different transformations
 * ```ts
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftSources({
 *     quickSearch: source<string>(),
 *     advancedSearch: source<{ query: string; options: unknown }>(),
 *   }),
 *   craftQuery('searchResults', ({ quickSearch, advancedSearch }) =>
 *     query({
 *       method: afterRecomputation(
 *         // Can combine sources at higher level
 *         quickSearch, // For this example, using one source
 *         (term) => ({ query: term, mode: 'quick' })
 *       ),
 *       loader: async ({ params }) => {
 *         const response = await fetch('/api/search', {
 *           method: 'POST',
 *           body: JSON.stringify(params),
 *         });
 *         return response.json();
 *       },
 *     })
 *   )
 * );
 *
 * const store = injectCraft();
 *
 * // Quick search with simple string
 * store.setQuickSearch('angular');
 * // -> query receives { query: 'angular', mode: 'quick' }
 * ```
 *
 * @example
 * Identity transformation (pass-through)
 * ```ts
 * const { injectCraft } = craft(
 *   { name: '', providedIn: 'root' },
 *   craftSources({
 *     dataUpdate: source<{ id: string; payload: unknown }>(),
 *   }),
 *   craftMutations(({ dataUpdate }) => ({
 *     update: mutation({
 *       // Pass data through unchanged
 *       method: afterRecomputation(dataUpdate, (data) => data),
 *       loader: async ({ params }) => {
 *         const response = await fetch(`/api/data/${params.id}`, {
 *           method: 'PUT',
 *           body: JSON.stringify(params.payload),
 *         });
 *         return response.json();
 *       },
 *     }),
 *   }))
 * );
 *
 * const store = injectCraft();
 *
 * // Data passed through unchanged
 * store.setDataUpdate({ id: 'item-1', payload: { value: 123 } });
 * // -> mutation receives exact same object
 * ```
 */
export function afterRecomputation<State, SourceType>(
  _source: SignalSource<SourceType>,
  callback: (source: SourceType) => State,
): ReadonlySource<State> {
  const derivedSource = signal<State | undefined>(undefined);
  const effectRef = effect(() => {
    const sourceValue = _source();
    if (sourceValue !== undefined) {
      untracked(() => {
        const newState = callback(sourceValue);
        derivedSource.set(newState);
      });
    } else {
      derivedSource.set(undefined);
    }
  });
  return Object.assign(
    derivedSource,
    SourceBranded,
  ) as unknown as ReadonlySource<State>;
}
