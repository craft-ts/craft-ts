import { linkedSignal, Signal, ValueEqualityFn } from '@angular/core';
import { ReadonlySource } from './util/source.type';
import { SignalSource } from './signal-source';
import { SourceBranded } from './util/util';

/**
 * Creates a derived readonly source that transforms values from an origin source using a computation function.
 *
 * This function enables reactive transformations of source emissions by:
 * - Computing new values whenever the origin source emits
 * - Maintaining source semantics (emits only when explicitly set, not on first read)
 * - Supporting custom equality comparisons for memoization
 * - Providing both standard and value-preserving listeners
 * - Creating composable source pipelines
 *
 * @remarks
 * **Emission Behavior:**
 * - Only emits when the origin source emits (explicit set/update)
 * - First read returns `undefined` by default (maintains source semantics)
 * - Use `preserveLastValue` variant to get computed value on first read
 *
 * **Use Cases:**
 * - **Data transformation**: Convert source payloads to different shapes
 * - **Filtering**: Extract specific fields from complex source data
 * - **Formatting**: Apply formatting logic to source values
 * - **Type narrowing**: Cast or validate source data types
 * - **Composition**: Chain multiple source transformations
 * - **Business logic**: Apply domain-specific computations
 *
 * **Source vs Signal:**
 * - Sources emit only on explicit events (set/update calls)
 * - Signals recompute on every access when dependencies change
 * - computedSource maintains source lazy behavior
 *
 * **Equality Comparison:**
 * - Default: Uses Angular's default equality check
 * - Custom: Provide `equal` option for custom comparison
 * - Prevents unnecessary emissions when computed value hasn't changed
 *
 * @template SourceState - The type of values emitted by the origin source
 * @template ComputedValue - The type of values produced by the computation
 *
 * @param signalOrigin - The source or readonly source to derive from.
 *   Values emitted by this source are passed to the computation function.
 *
 * @param computedFn - Function that transforms source values to computed values.
 *   Called each time the origin source emits.
 *
 * @param options - Optional configuration:
 *   - `equal`: Custom equality function for computed values
 *   - `debugName`: Name for debugging purposes
 *
 * @returns A readonly source that emits computed values with:
 *   - Standard behavior: First read returns `undefined`, subsequent reads return computed value after source emits
 *   - `preserveLastValue` property: Returns computed value immediately on first read if source has emitted
 *
 * @example
 * Basic transformation of source data
 * ```ts
 * const userSource = source<{ firstName: string; lastName: string }>();
 *
 * // Compute full name from user data
 * const fullNameSource = computedSource(
 *   userSource,
 *   (user) => `${user.firstName} ${user.lastName}`
 * );
 *
 * // Use in async method or query
 * const greetUser = craftUse(asyncProcess({
 *   method: afterRecomputation(fullNameSource, (fullName) => fullName),
 *   loader: async ({ params }) => {
 *     return `Hello, ${params}!`;
 *   },
 * }));
 *
 * // Trigger chain
 * userSource.set({ firstName: 'John', lastName: 'Doe' });
 * // -> fullNameSource emits 'John Doe'
 * // -> greetUser executes with 'John Doe'
 * ```
 *
 * @example
 * Extracting specific fields from complex data
 * ```ts
 * type FormData = {
 *   personal: { name: string; email: string };
 *   address: { street: string; city: string };
 *   preferences: { newsletter: boolean };
 * };
 *
 * const formSource = source<FormData>();
 *
 * // Extract only email for validation
 * const emailSource = computedSource(
 *   formSource,
 *   (form) => form.personal.email
 * );
 *
 * // Extract only address for geocoding
 * const addressSource = computedSource(
 *   formSource,
 *   (form) => form.address
 * );
 *
 * // Use extracted sources
 * const validateEmail = craftUse(asyncProcess({
 *   method: afterRecomputation(emailSource, (email) => email),
 *   loader: async ({ params }) => {
 *     const response = await fetch('/api/validate-email', {
 *       method: 'POST',
 *       body: JSON.stringify({ email: params }),
 *     });
 *     return response.json();
 *   },
 * }));
 *
 * // Update form triggers both validations
 * formSource.set({
 *   personal: { name: 'John', email: 'john@example.com' },
 *   address: { street: '123 Main St', city: 'NYC' },
 *   preferences: { newsletter: true },
 * });
 * ```
 *
 * @example
 * Chaining computed sources for multi-step transformation
 * ```ts
 * const inputSource = source<string>();
 *
 * // Step 1: Trim and lowercase
 * const normalizedSource = computedSource(
 *   inputSource,
 *   (input) => input.trim().toLowerCase()
 * );
 *
 * // Step 2: Extract search terms
 * const searchTermsSource = computedSource(
 *   normalizedSource,
 *   (normalized) => normalized.split(' ').filter(term => term.length > 0)
 * );
 *
 * // Step 3: Create search query
 * const searchQuerySource = computedSource(
 *   searchTermsSource,
 *   (terms) => ({ terms, operator: 'AND' as const })
 * );
 *
 * // Final async method uses fully transformed data
 * const search = craftUse(asyncProcess({
 *   method: afterRecomputation(searchQuerySource, (query) => query),
 *   loader: async ({ params }) => {
 *     const response = await fetch('/api/search', {
 *       method: 'POST',
 *       body: JSON.stringify(params),
 *     });
 *     return response.json();
 *   },
 * }));
 *
 * // Single input triggers entire chain
 * inputSource.set('  Angular  Signals  ');
 * // -> normalizedSource emits 'angular signals'
 * // -> searchTermsSource emits ['angular', 'signals']
 * // -> searchQuerySource emits { terms: ['angular', 'signals'], operator: 'AND' }
 * // -> search executes
 * ```
 *
 * @example
 * Custom equality comparison
 * ```ts
 * type SearchParams = { query: string; timestamp: number };
 *
 * const searchSource = source<SearchParams>();
 *
 * // Only emit when query changes, ignore timestamp
 * const queryOnlySource = computedSource(
 *   searchSource,
 *   (params) => params.query,
 *   {
 *     equal: (a, b) => a === b, // Compare strings
 *   }
 * );
 *
 * // Update with same query but different timestamp
 * searchSource.set({ query: 'test', timestamp: Date.now() });
 * // -> queryOnlySource emits 'test'
 *
 * searchSource.set({ query: 'test', timestamp: Date.now() });
 * // -> queryOnlySource does NOT emit (same query)
 *
 * searchSource.set({ query: 'new', timestamp: Date.now() });
 * // -> queryOnlySource emits 'new'
 * ```
 *
 * @example
 * Type narrowing and validation
 * ```ts
 * type ApiResponse =
 *   | { type: 'success'; data: unknown }
 *   | { type: 'error'; message: string };
 *
 * const responseSource = source<ApiResponse>();
 *
 * // Extract only successful data
 * const successDataSource = computedSource(
 *   responseSource,
 *   (response) => {
 *     if (response.type === 'success') {
 *       return response.data;
 *     }
 *     return null;
 *   }
 * );
 *
 * // Extract only errors
 * const errorSource = computedSource(
 *   responseSource,
 *   (response) => {
 *     if (response.type === 'error') {
 *       return response.message;
 *     }
 *     return null;
 *   }
 * );
 *
 * // Handle success and errors separately
 * const Processuccess = craftUse(asyncProcess({
 *   method: afterRecomputation(successDataSource, (data) => data),
 *   loader: async ({ params }) => {
 *     if (!params) return null;
 *     // Process successful data
 *     return processData(params);
 *   },
 * }));
 *
 * const logError = craftUse(asyncProcess({
 *   method: afterRecomputation(errorSource, (error) => error),
 *   loader: async ({ params }) => {
 *     if (!params) return null;
 *     // Log error
 *     await logToService(params);
 *     return { logged: true };
 *   },
 * }));
 * ```
 *
 * @example
 * Formatting and presentation logic
 * ```ts
 * type Price = { amount: number; currency: string };
 *
 * const priceSource = source<Price>();
 *
 * // Format price for display
 * const formattedPriceSource = computedSource(
 *   priceSource,
 *   (price) => {
 *     const formatter = new Intl.NumberFormat('en-US', {
 *       style: 'currency',
 *       currency: price.currency,
 *     });
 *     return formatter.format(price.amount);
 *   }
 * );
 *
 * // Use formatted value in UI updates
 * const updatePriceDisplay = craftUse(asyncProcess({
 *   method: afterRecomputation(formattedPriceSource, (formatted) => formatted),
 *   loader: async ({ params }) => {
 *     // Update analytics or external service
 *     await trackPriceView(params);
 *     return { displayed: params };
 *   },
 * }));
 *
 * priceSource.set({ amount: 1234.56, currency: 'USD' });
 * // -> formattedPriceSource emits '$1,234.56'
 * ```
 *
 * @example
 * Using preserveLastValue for immediate computed access
 * ```ts
 * const counterSource = source<number>();
 *
 * const doubledSource = computedSource(
 *   counterSource,
 *   (count) => count * 2
 * );
 *
 * // Standard behavior
 * console.log(doubledSource()); // undefined (no emission yet)
 *
 * counterSource.set(5);
 * console.log(doubledSource()); // 10
 *
 * // Using preserveLastValue
 * const immediateDoubled = doubledSource.preserveLastValue;
 * console.log(immediateDoubled()); // 10 (gets last computed value immediately)
 * ```
 */
export function computedSource<SourceState, ComputedValue>(
  signalOrigin: SignalSource<SourceState> | ReadonlySource<SourceState>,
  computedFn: (sourceValue: NoInfer<SourceState>) => ComputedValue,
  options?: {
    equal?: ValueEqualityFn<NoInfer<ComputedValue> | undefined>;
    debugName?: string;
  },
): ReadonlySource<ComputedValue> {
  const listener = (listenerOptions: { nullishFirstValue?: boolean }) =>
    linkedSignal<SourceState, ComputedValue | undefined>({
      source: signalOrigin as Signal<SourceState>,
      computation: (currentSourceState, previousData) => {
        // always when first listened return undefined
        if (!previousData && listenerOptions?.nullishFirstValue !== false) {
          return undefined;
        }

        return computedFn(currentSourceState);
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
    },
    SourceBranded,
  ) as ReadonlySource<any>;
}
