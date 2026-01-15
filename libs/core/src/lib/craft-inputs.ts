import { Signal } from '@angular/core';
import {
  ContextConstraints,
  CraftFactoryUtility,
  partialContext,
  PartialContext,
  StoreConfigConstraints,
} from './craft';
import { Prettify } from './util/util.type';

type ToSignalObject<T> = {
  [K in keyof T]: Signal<T[K]>;
};

type SpecificCraftInputsOutputs<Inputs extends {}> = PartialContext<{
  _inputs: Prettify<ToSignalObject<Inputs>>;
}>;

type CraftInputsOutputs<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  Inputs extends {},
> = CraftFactoryUtility<
  Context,
  StoreConfig,
  SpecificCraftInputsOutputs<Inputs>
>;

/**
 * Creates input definitions for use within a craft store, enabling dynamic parameter injection from components.
 *
 * This function enables external data to be passed into a craft store by:
 * - Defining a schema of expected input parameters with their types
 * - Converting input values to signals automatically
 * - Making inputs accessible to all craft entries (queries, mutations, states)
 * - Providing type-safe parameter passing from components to store
 * - Supporting optional and required inputs
 * - Enabling reactive updates when input values change
 *
 * @remarks
 * **Use Cases:**
 * - **Dynamic parameters**: Pass component-specific data to queries (e.g., route params, user selections)
 * - **External signals**: Inject signals from parent components or services
 * - **Conditional loading**: Control when queries execute based on input availability
 * - **Multi-instance stores**: Create store instances with different input configurations
 * - **Component coordination**: Share component state with store logic
 *
 * **Input Definition:**
 * - Define inputs as a record of keys with their types
 * - Use `undefined` in union types for optional inputs
 * - Inputs are automatically converted to signals in the context
 *
 * **Context Access:**
 * - Inputs are accessible in all craft entries via the context parameter
 * - Access as: `context.inputName` in query/mutation/state factories
 * - Inputs are available as signals: `context.inputName()` returns the value
 *
 * **Store Injection:**
 * - When injecting the store, pass actual signal values: `injectCraft({ inputs: { inputName: signal(value) } })`
 * - TypeScript enforces providing all required inputs
 * - Optional inputs can be omitted
 *
 * **Reactive Behavior:**
 * - When input signals change, dependent queries automatically re-execute
 * - Mutations and states can react to input changes
 * - Use with `params: () => context.inputName()` for reactive queries
 *
 * @template Context - The craft store context type
 * @template StoreConfig - The craft store configuration type
 * @template Inputs - Record of input names to their value types
 *
 * @param inputs - Schema object defining input names and their types.
 *   Values are used for type inference only; actual values are provided during injection.
 *
 * @returns A craft factory utility that:
 *   - Adds inputs to the store context for use by other craft entries
 *   - Requires input signals to be provided when injecting the store
 *   - Provides full type safety for input values
 *
 * @example
 * Basic inputs for dynamic query parameters
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'UserStore', providedIn: 'root' },
 *   craftInputs({
 *     userId: undefined as string | undefined,
 *   }),
 *   craftQuery('user', ({ userId }) =>
 *     query({
 *       params: userId, // Uses the input signal directly
 *       loader: async ({ params }) => {
 *         if (!params) return undefined;
 *         const response = await fetch(`/api/users/${params}`);
 *         return response.json();
 *       },
 *     })
 *   )
 * );
 *
 * // In a component
 * @Component({
 *   selector: 'app-user-profile',
 *   template: `
 *     @if (store.user.value()) {
 *       <div>{{ store.user.value().name }}</div>
 *     }
 *   `,
 * })
 * export class UserProfileComponent {
 *   route = inject(ActivatedRoute);
 *
 *   // Create signal from route param
 *   userId = toSignal(this.route.params.pipe(map(p => p['id'])));
 *
 *   // Inject store with input
 *   store = injectCraft({
 *     inputs: {
 *       userId: this.userId, // Pass the signal
 *     },
 *   });
 * }
 *
 * // Query automatically executes and re-executes when userId changes
 * ```
 *
 * @example
 * Multiple inputs with different types
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'ProductStore', providedIn: 'root' },
 *   craftInputs({
 *     categoryId: undefined as string | undefined,
 *     page: 1,
 *     pageSize: 10,
 *     sortBy: 'name' as 'name' | 'price' | 'date',
 *   }),
 *   craftQuery('products', ({ categoryId, page, pageSize, sortBy }) =>
 *     query({
 *       params: () => ({
 *         category: categoryId(),
 *         page: page(),
 *         pageSize: pageSize(),
 *         sortBy: sortBy(),
 *       }),
 *       loader: async ({ params }) => {
 *         const query = new URLSearchParams({
 *           category: params.category ?? '',
 *           page: String(params.page),
 *           pageSize: String(params.pageSize),
 *           sortBy: params.sortBy,
 *         });
 *         const response = await fetch(`/api/products?${query}`);
 *         return response.json();
 *       },
 *     })
 *   )
 * );
 *
 * // In a component
 * export class ProductListComponent {
 *   categoryId = signal<string | undefined>('electronics');
 *   page = signal(1);
 *   pageSize = signal(20);
 *   sortBy = signal<'name' | 'price' | 'date'>('price');
 *
 *   store = injectCraft({
 *     inputs: {
 *       categoryId: this.categoryId,
 *       page: this.page,
 *       pageSize: this.pageSize,
 *       sortBy: this.sortBy,
 *     },
 *   });
 *
 *   // Methods to update inputs
 *   changePage(newPage: number) {
 *     this.page.set(newPage);
 *     // Query automatically re-executes with new page
 *   }
 *
 *   changeSort(field: 'name' | 'price' | 'date') {
 *     this.sortBy.set(field);
 *     // Query automatically re-executes with new sort
 *   }
 * }
 * ```
 *
 * @example
 * Optional inputs with conditional query execution
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'SearchStore', providedIn: 'root' },
 *   craftInputs({
 *     searchTerm: undefined as string | undefined,
 *   }),
 *   craftQuery('results', ({ searchTerm }) =>
 *     query({
 *       params: searchTerm,
 *       loader: async ({ params }) => {
 *         // Only execute if search term is provided
 *         if (!params) return [];
 *
 *         const response = await fetch(`/api/search?q=${params}`);
 *         return response.json();
 *       },
 *     })
 *   )
 * );
 *
 * // In a component
 * export class SearchComponent {
 *   searchInput = signal<string | undefined>(undefined);
 *
 *   store = injectCraft({
 *     inputs: {
 *       searchTerm: this.searchInput,
 *     },
 *   });
 *
 *   onSearch(term: string) {
 *     if (term.length >= 3) {
 *       this.searchInput.set(term);
 *       // Query executes only when term has 3+ characters
 *     } else {
 *       this.searchInput.set(undefined);
 *       // Query doesn't execute (params undefined)
 *     }
 *   }
 * }
 * ```
 *
 * @example
 * Inputs used in mutations
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'FormStore', providedIn: 'root' },
 *   craftInputs({
 *     formId: undefined as string | undefined,
 *   }),
 *   craftMutations(({ formId }) => ({
 *     submitForm: mutation({
 *       method: (data: FormData) => data,
 *       loader: async ({ params }) => {
 *         const id = formId();
 *         if (!id) throw new Error('Form ID required');
 *
 *         const response = await fetch(`/api/forms/${id}/submit`, {
 *           method: 'POST',
 *           body: JSON.stringify(params),
 *         });
 *         return response.json();
 *       },
 *     }),
 *   }))
 * );
 *
 * // In a component
 * export class FormComponent {
 *   route = inject(ActivatedRoute);
 *   formId = toSignal(this.route.params.pipe(map(p => p['formId'])));
 *
 *   store = injectCraft({
 *     inputs: {
 *       formId: this.formId,
 *     },
 *   });
 *
 *   onSubmit(data: FormData) {
 *     // Mutation uses formId from input
 *     this.store.mutateSubmitForm(data);
 *   }
 * }
 * ```
 *
 * @example
 * Inputs shared across multiple craft entries
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'DashboardStore', providedIn: 'root' },
 *   craftInputs({
 *     dateRange: undefined as { start: Date; end: Date } | undefined,
 *     userId: undefined as string | undefined,
 *   }),
 *   craftQuery('sales', ({ dateRange, userId }) =>
 *     query({
 *       params: () => ({ dateRange: dateRange(), userId: userId() }),
 *       loader: async ({ params }) => {
 *         if (!params.dateRange || !params.userId) return null;
 *         const response = await fetch('/api/sales', {
 *           method: 'POST',
 *           body: JSON.stringify(params),
 *         });
 *         return response.json();
 *       },
 *     })
 *   ),
 *   craftQuery('analytics', ({ dateRange, userId }) =>
 *     query({
 *       params: () => ({ dateRange: dateRange(), userId: userId() }),
 *       loader: async ({ params }) => {
 *         if (!params.dateRange || !params.userId) return null;
 *         const response = await fetch('/api/analytics', {
 *           method: 'POST',
 *           body: JSON.stringify(params),
 *         });
 *         return response.json();
 *       },
 *     })
 *   )
 * );
 *
 * // Both queries use the same inputs
 * export class DashboardComponent {
 *   dateRange = signal<{ start: Date; end: Date } | undefined>(undefined);
 *   userId = signal<string | undefined>('user-123');
 *
 *   store = injectCraft({
 *     inputs: {
 *       dateRange: this.dateRange,
 *       userId: this.userId,
 *     },
 *   });
 *
 *   // Both queries re-execute when inputs change
 *   updateDateRange(start: Date, end: Date) {
 *     this.dateRange.set({ start, end });
 *   }
 * }
 * ```
 *
 * @example
 * Complex input types
 * ```ts
 * type FilterOptions = {
 *   status: 'active' | 'inactive' | 'all';
 *   tags: string[];
 *   minPrice?: number;
 *   maxPrice?: number;
 * };
 *
 * const { injectCraft } = craft(
 *   { name: 'ItemStore', providedIn: 'root' },
 *   craftInputs({
 *     filters: undefined as FilterOptions | undefined,
 *     sort: 'name' as 'name' | 'price' | 'date',
 *   }),
 *   craftQuery('items', ({ filters, sort }) =>
 *     query({
 *       params: () => ({
 *         filters: filters(),
 *         sort: sort(),
 *       }),
 *       loader: async ({ params }) => {
 *         const response = await fetch('/api/items', {
 *           method: 'POST',
 *           body: JSON.stringify(params),
 *         });
 *         return response.json();
 *       },
 *     })
 *   )
 * );
 *
 * export class ItemListComponent {
 *   filters = signal<FilterOptions | undefined>({
 *     status: 'active',
 *     tags: [],
 *   });
 *   sort = signal<'name' | 'price' | 'date'>('name');
 *
 *   store = injectCraft({
 *     inputs: {
 *       filters: this.filters,
 *       sort: this.sort,
 *     },
 *   });
 *
 *   updateFilters(newFilters: Partial<FilterOptions>) {
 *     this.filters.update(current => ({ ...current!, ...newFilters }));
 *   }
 * }
 * ```
 */
export function craftInputs<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  Inputs extends {},
>(inputs: Inputs): CraftInputsOutputs<Context, StoreConfig, Inputs> {
  // todo expose setXInputs as standalone ?
  return () => () => {
    return partialContext({
      _inputs: inputs,
    }) as SpecificCraftInputsOutputs<Inputs>;
  };
}
