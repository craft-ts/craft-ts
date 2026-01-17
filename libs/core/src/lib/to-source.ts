import {
  linkedSignal,
  Signal,
  untracked,
  ValueEqualityFn,
  WritableSignal,
} from '@angular/core';
import { IsUnknown } from './util/util.type';
import { ReadonlySource } from './util/source.type';
import { SourceBranded } from './util/util';

/**
 * Converts an Angular signal into a readonly source with lazy emission semantics.
 *
 * This function bridges the gap between signals and sources by:
 * - Converting continuous signal values into discrete source emissions
 * - Implementing lazy emission (only emits on signal changes, not on first read)
 * - Supporting optional value transformation via computed function
 * - Providing both standard and value-preserving listener variants
 * - Enabling signal-to-source conversions for event-driven architectures
 *
 * @remarks
 * **Signal vs Source Semantics:**
 * - **Signals**: Continuously readable, always have a value, recompute on access
 * - **Sources**: Emit only on explicit changes, lazy by default (undefined on first read)
 * - toSource converts continuous signal behavior to discrete source emissions
 *
 * **Emission Behavior:**
 * - First read returns `undefined` by default (maintains source lazy semantics)
 * - Subsequent reads return new values only when the origin signal changes
 * - Use `preserveLastValue` variant to get immediate value on first read
 *
 * **Use Cases:**
 * - **Event-driven patterns**: Convert signals to sources for reactive chains
 * - **Debounced signals**: Wrap debounced signals as sources for queries/mutations
 * - **External state**: Convert RxJS signals (toSignal) to sources
 * - **Form signals**: Convert form control signals to sources for automatic submission
 * - **Route params**: Convert router param signals to sources for automatic queries
 * - **Filtering**: Transform signal values while converting to source
 *
 * **Transformation:**
 * - Without `computed`: Passes signal values through unchanged
 * - With `computed`: Applies transformation before emitting to source
 * - Useful for extracting fields, formatting, or type narrowing
 *
 * **Comparison with computedSource:**
 * - `toSource`: Converts signals to sources (signal → source)
 * - `computedSource`: Transforms sources to sources (source → source)
 * - Use toSource when bridging from signal world to source world
 *
 * @template SourceState - The type of values from the origin signal
 * @template ComputedValue - The type of values after optional computation
 *
 * @param signalOrigin - The signal or writable signal to convert.
 *   Changes to this signal trigger source emissions.
 *
 * @param options - Optional configuration:
 *   - `computed`: Function to transform signal values before emission
 *   - `equal`: Custom equality function for change detection
 *   - `debugName`: Name for debugging purposes
 *
 * @returns A readonly source that emits when the signal changes with:
 *   - Standard behavior: First read returns `undefined`, subsequent reads return values after signal changes
 *   - `preserveLastValue` property: Returns current value immediately on first read
 *
 * @example
 * Basic signal to source conversion
 * ```ts
 * const countSignal = signal(0);
 * const countSource = toSource(countSignal);
 *
 * // Use in query for automatic execution
 * const fetchData = query({
 *   method: afterRecomputation(countSource, (count) => count),
 *   loader: async ({ params }) => {
 *     const response = await fetch(`/api/data/${params}`);
 *     return response.json();
 *   },
 * });
 *
 * // Query executes when signal changes
 * countSignal.set(1);
 * // -> countSource emits 1
 * // -> fetchData executes with params 1
 *
 * countSignal.set(2);
 * // -> countSource emits 2
 * // -> fetchData executes with params 2
 * ```
 *
 * @example
 * Converting route params to source
 * ```ts
 * @Component({
 *   selector: 'app-user-detail',
 *   template: `...`,
 * })
 * export class UserDetailComponent {
 *   route = inject(ActivatedRoute);
 *
 *   // Convert route param to signal
 *   userIdSignal = toSignal(
 *     this.route.params.pipe(map(p => p['userId']))
 *   );
 *
 *   // Convert signal to source
 *   userIdSource = toSource(this.userIdSignal);
 *
 *   // Use source in query
 *   { injectCraft } = craft(
 *     { name: '', providedIn: 'root' },
 *     craftQuery('user', () =>
 *       query({
 *         method: afterRecomputation(this.userIdSource, (id) => id),
 *         loader: async ({ params }) => {
 *           if (!params) return null;
 *           const response = await fetch(`/api/users/${params}`);
 *           return response.json();
 *         },
 *       })
 *     )
 *   );
 *
 *   store = this.injectCraft();
 *
 *   // Query automatically updates when route changes
 * }
 * ```
 *
 * @example
 * Transforming signal values during conversion
 * ```ts
 * type FormData = {
 *   name: string;
 *   email: string;
 *   preferences: { newsletter: boolean };
 * };
 *
 * const formSignal = signal<FormData>({
 *   name: '',
 *   email: '',
 *   preferences: { newsletter: false },
 * });
 *
 * // Extract only email for validation
 * const emailSource = toSource(formSignal, {
 *   computed: (form) => form.email,
 * });
 *
 * // Use in async method
 * const validateEmail = asyncMethod({
 *   method: afterRecomputation(emailSource, (email) => email),
 *   loader: async ({ params }) => {
 *     if (!params) return null;
 *     const response = await fetch('/api/validate-email', {
 *       method: 'POST',
 *       body: JSON.stringify({ email: params }),
 *     });
 *     return response.json();
 *   },
 * });
 *
 * // Email validation triggers when form email changes
 * formSignal.update(form => ({ ...form, email: 'john@example.com' }));
 * // -> emailSource emits 'john@example.com'
 * // -> validateEmail executes
 * ```
 *
 * @example
 * Debounced signal to source
 * ```ts
 * const searchInputSignal = signal('');
 *
 * // Create debounced signal (using custom debounce logic)
 * const debouncedSearchSignal = computed(() => {
 *   const input = searchInputSignal();
 *   // Debounce logic would go here
 *   return input;
 * });
 *
 * // Convert to source
 * const debouncedSearchSource = toSource(debouncedSearchSignal);
 *
 * // Use in query
 * const searchResults = query({
 *   method: afterRecomputation(debouncedSearchSource, (term) => term),
 *   loader: async ({ params }) => {
 *     if (!params) return [];
 *     const response = await fetch(`/api/search?q=${params}`);
 *     return response.json();
 *   },
 * });
 *
 * // Query executes only after debounce
 * searchInputSignal.set('ang');
 * searchInputSignal.set('angu');
 * searchInputSignal.set('angular');
 * // -> Eventually debouncedSearchSource emits 'angular'
 * // -> searchResults query executes once
 * ```
 *
 * @example
 * Form control signal to source
 * ```ts
 * @Component({
 *   selector: 'app-search',
 *   template: `
 *     <input [formControl]="searchControl" />
 *   `,
 * })
 * export class SearchComponent {
 *   searchControl = new FormControl('');
 *
 *   // Convert form control value to signal
 *   searchSignal = toSignal(
 *     this.searchControl.valueChanges.pipe(
 *       debounceTime(300),
 *       distinctUntilChanged()
 *     ),
 *     { initialValue: '' }
 *   );
 *
 *   // Convert signal to source
 *   searchSource = toSource(this.searchSignal);
 *
 *   // Use in store
 *   { injectCraft } = craft(
 *     { name: '', providedIn: 'root' },
 *     craftQuery('results', () =>
 *       query({
 *         method: afterRecomputation(this.searchSource, (term) => term),
 *         loader: async ({ params }) => {
 *           const response = await fetch(`/api/search?q=${params}`);
 *           return response.json();
 *         },
 *       })
 *     )
 *   );
 *
 *   store = this.injectCraft();
 * }
 * ```
 *
 * @example
 * Custom equality for change detection
 * ```ts
 * type SearchParams = { query: string; timestamp: number };
 *
 * const paramsSignal = signal<SearchParams>({
 *   query: '',
 *   timestamp: Date.now(),
 * });
 *
 * // Only emit when query changes, ignore timestamp
 * const querySource = toSource(paramsSignal, {
 *   computed: (params) => params.query,
 *   equal: (a, b) => a === b, // Compare strings only
 * });
 *
 * // Update with same query but different timestamp
 * paramsSignal.set({ query: 'test', timestamp: Date.now() });
 * // -> querySource emits 'test'
 *
 * paramsSignal.set({ query: 'test', timestamp: Date.now() });
 * // -> querySource does NOT emit (same query)
 *
 * paramsSignal.set({ query: 'new', timestamp: Date.now() });
 * // -> querySource emits 'new'
 * ```
 *
 * @example
 * Using preserveLastValue for immediate access
 * ```ts
 * const countSignal = signal(5);
 * const countSource = toSource(countSignal);
 *
 * // Standard behavior - first read is undefined
 * console.log(countSource()); // undefined
 *
 * countSignal.set(10);
 * console.log(countSource()); // 10
 *
 * // Using preserveLastValue - gets current value immediately
 * const immediateCount = countSource.preserveLastValue;
 * console.log(immediateCount()); // 10
 *
 * countSignal.set(15);
 * console.log(immediateCount()); // 15
 * ```
 *
 * @example
 * Complex transformation with validation
 * ```ts
 * type RawInput = { text: string; valid?: boolean };
 *
 * const inputSignal = signal<RawInput>({ text: '' });
 *
 * // Transform and validate during conversion
 * const validInputSource = toSource(inputSignal, {
 *   computed: (input) => {
 *     const trimmed = input.text.trim();
 *     if (trimmed.length < 3) {
 *       return null; // Invalid input
 *     }
 *     return {
 *       text: trimmed.toLowerCase(),
 *       length: trimmed.length,
 *     };
 *   },
 * });
 *
 * // Use in mutation
 * const submitInput = mutation({
 *   method: afterRecomputation(validInputSource, (data) => data),
 *   loader: async ({ params }) => {
 *     if (!params) {
 *       throw new Error('Invalid input');
 *     }
 *     const response = await fetch('/api/submit', {
 *       method: 'POST',
 *       body: JSON.stringify(params),
 *     });
 *     return response.json();
 *   },
 * });
 *
 * // Invalid input
 * inputSignal.set({ text: 'ab' });
 * // -> validInputSource emits null
 * // -> submitInput throws error
 *
 * // Valid input
 * inputSignal.set({ text: 'Valid Input' });
 * // -> validInputSource emits { text: 'valid input', length: 11 }
 * // -> submitInput executes with transformed data
 * ```
 */
export function toSource<SourceState, ComputedValue>(
  signalOrigin: Signal<SourceState> | WritableSignal<SourceState>,
  options?: {
    computed?: (sourceValue: NoInfer<SourceState>) => ComputedValue;
    equal?: ValueEqualityFn<NoInfer<SourceState> | undefined>;
    debugName?: string;
  },
): ReadonlySource<
  IsUnknown<ComputedValue> extends true ? SourceState : ComputedValue
> {
  const sourceState = linkedSignal<SourceState | undefined>(signalOrigin, {
    ...(options?.equal && { equal: options?.equal }), // add the equal function here, it may helps to detect changes when using scalar values
    ...(options?.debugName && {
      debugName: options?.debugName + '_sourceState',
    }),
  });

  const listener = (listenerOptions: { nullishFirstValue?: boolean }) =>
    linkedSignal<SourceState, any>({
      source: sourceState as Signal<SourceState>,
      computation: (currentSourceState, previousData) => {
        // always when first listened return undefined
        if (!previousData && listenerOptions?.nullishFirstValue !== false) {
          return undefined;
        }
        //! use untracked to avoid computed to be re-evaluated when used inside another effect/computed
        return untracked(() =>
          options?.computed
            ? options?.computed?.(currentSourceState)
            : currentSourceState,
        );
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
