import { Signal } from '@angular/core';
import {
  ContextConstraints,
  craftFactoryEntries,
  CraftFactoryEntries,
  CraftFactoryUtility,
  partialContext,
  PartialContext,
  StoreConfigConstraints,
} from './craft';

type SpecificCraftComputedOutputs<Computed extends {}> = PartialContext<{
  props: Computed;
}>;

type CraftComputedStatesOutputs<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  Computed extends {},
> = CraftFactoryUtility<
  Context,
  StoreConfig,
  SpecificCraftComputedOutputs<Computed>
>;

/**
 * Creates computed signals derived from other craft store entries (queries, mutations, states).
 *
 * This function enables reactive derived values in craft stores by:
 * - Creating computed signals that automatically update when dependencies change
 * - Deriving values from queries, mutations, states, and other computed signals
 * - Exposing computed values directly on the store (no prefix)
 * - Providing full type safety for computed values
 * - Enabling complex transformations and combinations of store data
 * - Supporting memo-ization for performance optimization
 *
 * @remarks
 * **Naming Convention:**
 * - Computed signals are accessible directly: `store.computedName()`
 * - No prefix added (unlike queries/mutations)
 * - Access pattern is identical to regular Angular signals
 *
 * **Use Cases:**
 * - **Derived data**: Calculate values based on query/state results (totals, counts, filtered lists)
 * - **Data transformation**: Format or reshape data from queries
 * - **Aggregation**: Combine data from multiple queries or states
 * - **Status derivation**: Compute loading states from multiple queries
 * - **Validation**: Derive validation status from form states
 * - **UI state**: Calculate UI flags based on multiple conditions
 *
 * **Context Access:**
 * - Computed factory receives full access to the craft context
 * - Can access queries, mutations, states, sources, and other computed values
 * - Context entries are accessed as signals: `context.queryName()`, `context.stateName()`
 *
 * **Reactive Behavior:**
 * - Computed signals automatically update when dependencies change
 * - Only recompute when accessed and dependencies have changed (memo-ized)
 * - Follow Angular's computed signal semantics
 * - Can be used in templates and effects like any signal
 *
 * **Performance:**
 * - Computed values are cached and only recompute when necessary
 * - Multiple accesses without dependency changes don't trigger recomputation
 * - Efficient for expensive calculations or transformations
 *
 * @template Context - The craft store context type
 * @template StoreConfig - The craft store configuration type
 * @template Computed - Record of computed signal names to signal types
 *
 * @param computedFactory - Factory function that receives the craft context and returns a record of computed signals.
 *   Has access to all other craft entries (queries, mutations, states) defined before it.
 *
 * @returns A craft factory utility that:
 *   - Creates computed signals based on store data
 *   - Exposes them directly on the store
 *   - Provides full type safety for computed values
 *
 * @example
 * Basic computed values from state
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'CounterStore', providedIn: 'root' },
 *   craftState('count', () => state(0)),
 *   craftComputedStates(({ count }) => ({
 *     doubled: computed(() => count() * 2),
 *     isEven: computed(() => count() % 2 === 0),
 *     message: computed(() => `Count is ${count()}`),
 *   }))
 * );
 *
 * const store = injectCraft();
 *
 * console.log(store.doubled()); // 0
 * console.log(store.isEven()); // true
 *
 * store.setCount(5);
 * console.log(store.doubled()); // 10
 * console.log(store.isEven()); // false
 * console.log(store.message()); // 'Count is 5'
 * ```
 *
 * @example
 * Computed values from query results
 * ```ts
 * type Todo = { id: string; text: string; done: boolean };
 *
 * const { injectCraft } = craft(
 *   { name: 'TodoStore', providedIn: 'root' },
 *   craftQuery('todos', () =>
 *     query({
 *       params: () => ({}),
 *       loader: async () => {
 *         const response = await fetch('/api/todos');
 *         return response.json() as Todo[];
 *       },
 *     })
 *   ),
 *   craftComputedStates(({ todos }) => ({
 *     completedCount: computed(() => {
 *       const list = todos.value();
 *       return list?.filter(t => t.done).length ?? 0;
 *     }),
 *     pendingCount: computed(() => {
 *       const list = todos.value();
 *       return list?.filter(t => !t.done).length ?? 0;
 *     }),
 *     totalCount: computed(() => todos.value()?.length ?? 0),
 *     allCompleted: computed(() => {
 *       const list = todos.value();
 *       return list ? list.length > 0 && list.every(t => t.done) : false;
 *     }),
 *   }))
 * );
 *
 * const store = injectCraft();
 *
 * // Use in template
 * // <div>{{ store.completedCount() }} / {{ store.totalCount() }} completed</div>
 * // <button [disabled]="store.allCompleted()">Complete All</button>
 * ```
 *
 * @example
 * Combining multiple queries
 * ```ts
 * type User = { id: string; name: string };
 * type Post = { id: string; userId: string; title: string };
 *
 * const { injectCraft } = craft(
 *   { name: 'BlogStore', providedIn: 'root' },
 *   craftQuery('users', () =>
 *     query({
 *       params: () => ({}),
 *       loader: async () => {
 *         const response = await fetch('/api/users');
 *         return response.json() as User[];
 *       },
 *     })
 *   ),
 *   craftQuery('posts', () =>
 *     query({
 *       params: () => ({}),
 *       loader: async () => {
 *         const response = await fetch('/api/posts');
 *         return response.json() as Post[];
 *       },
 *     })
 *   ),
 *   craftComputedStates(({ users, posts }) => ({
 *     postsWithAuthors: computed(() => {
 *       const userList = users.value();
 *       const postList = posts.value();
 *
 *       if (!userList || !postList) return [];
 *
 *       return postList.map(post => ({
 *         ...post,
 *         author: userList.find(u => u.id === post.userId),
 *       }));
 *     }),
 *     userPostCount: computed(() => {
 *       const postList = posts.value();
 *       if (!postList) return new Map();
 *
 *       return postList.reduce((map, post) => {
 *         map.set(post.userId, (map.get(post.userId) ?? 0) + 1);
 *         return map;
 *       }, new Map<string, number>());
 *     }),
 *   }))
 * );
 *
 * const store = injectCraft();
 *
 * // Automatically combines data from both queries
 * const enrichedPosts = store.postsWithAuthors();
 * const postCounts = store.userPostCount();
 * ```
 *
 * @example
 * Loading state aggregation
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'DashboardStore', providedIn: 'root' },
 *   craftQuery('sales', () =>
 *     query({
 *       params: () => ({}),
 *       loader: async () => {
 *         const response = await fetch('/api/sales');
 *         return response.json();
 *       },
 *     })
 *   ),
 *   craftQuery('analytics', () =>
 *     query({
 *       params: () => ({}),
 *       loader: async () => {
 *         const response = await fetch('/api/analytics');
 *         return response.json();
 *       },
 *     })
 *   ),
 *   craftComputedStates(({ sales, analytics }) => ({
 *     isLoading: computed(() =>
 *       sales.isLoading() || analytics.isLoading()
 *     ),
 *     hasError: computed(() =>
 *       sales.error() !== undefined || analytics.error() !== undefined
 *     ),
 *     allLoaded: computed(() =>
 *       sales.hasValue() && analytics.hasValue()
 *     ),
 *     errorMessage: computed(() => {
 *       const salesError = sales.error();
 *       const analyticsError = analytics.error();
 *
 *       if (salesError) return `Sales error: ${salesError.message}`;
 *       if (analyticsError) return `Analytics error: ${analyticsError.message}`;
 *       return null;
 *     }),
 *   }))
 * );
 *
 * const store = injectCraft();
 *
 * // Use in template for unified loading state
 * // @if (store.isLoading()) { <spinner /> }
 * // @if (store.hasError()) { <error>{{ store.errorMessage() }}</error> }
 * // @if (store.allLoaded()) { <dashboard /> }
 * ```
 *
 * @example
 * Chaining computed values
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'CartStore', providedIn: 'root' },
 *   craftState('items', () =>
 *     state([] as Array<{ id: string; price: number; quantity: number }>)
 *   ),
 *   craftComputedStates(({ items }) => ({
 *     subtotal: computed(() =>
 *       items().reduce((sum, item) => sum + item.price * item.quantity, 0)
 *     ),
 *   })),
 *   craftComputedStates(({ subtotal }) => ({
 *     // Can depend on other computed values
 *     tax: computed(() => subtotal() * 0.1),
 *     shipping: computed(() => subtotal() > 100 ? 0 : 10),
 *   })),
 *   craftComputedStates(({ subtotal, tax, shipping }) => ({
 *     // Combine multiple computed values
 *     total: computed(() => subtotal() + tax() + shipping()),
 *     formatted: computed(() => ({
 *       subtotal: `$${subtotal().toFixed(2)}`,
 *       tax: `$${tax().toFixed(2)}`,
 *       shipping: shipping() === 0 ? 'FREE' : `$${shipping().toFixed(2)}`,
 *       total: `$${(subtotal() + tax() + shipping()).toFixed(2)}`,
 *     })),
 *   }))
 * );
 *
 * const store = injectCraft();
 *
 * console.log(store.formatted());
 * // { subtotal: '$0.00', tax: '$0.00', shipping: '$10.00', total: '$10.00' }
 * ```
 *
 * @example
 * Data transformation and filtering
 * ```ts
 * type Product = {
 *   id: string;
 *   name: string;
 *   category: string;
 *   price: number;
 *   inStock: boolean;
 * };
 *
 * const { injectCraft } = craft(
 *   { name: 'ProductStore', providedIn: 'root' },
 *   craftQuery('products', () =>
 *     query({
 *       params: () => ({}),
 *       loader: async () => {
 *         const response = await fetch('/api/products');
 *         return response.json() as Product[];
 *       },
 *     })
 *   ),
 *   craftState('selectedCategory', () => state<string | null>(null)),
 *   craftState('maxPrice', () => state<number | null>(null)),
 *   craftComputedStates(({ products, selectedCategory, maxPrice }) => ({
 *     filteredProducts: computed(() => {
 *       const list = products.value();
 *       if (!list) return [];
 *
 *       let filtered = list;
 *
 *       const category = selectedCategory();
 *       if (category) {
 *         filtered = filtered.filter(p => p.category === category);
 *       }
 *
 *       const price = maxPrice();
 *       if (price !== null) {
 *         filtered = filtered.filter(p => p.price <= price);
 *       }
 *
 *       return filtered;
 *     }),
 *     availableProducts: computed(() => {
 *       const list = products.value();
 *       return list?.filter(p => p.inStock) ?? [];
 *     }),
 *     categories: computed(() => {
 *       const list = products.value();
 *       if (!list) return [];
 *
 *       return [...new Set(list.map(p => p.category))];
 *     }),
 *   }))
 * );
 *
 * const store = injectCraft();
 *
 * // Filters update reactively
 * store.setSelectedCategory('electronics');
 * store.setMaxPrice(500);
 * const filtered = store.filteredProducts(); // Automatically filtered
 * ```
 *
 * @example
 * Validation computed values
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'FormStore', providedIn: 'root' },
 *   craftState('email', () => state('')),
 *   craftState('password', () => state('')),
 *   craftState('confirmPassword', () => state('')),
 *   craftComputedStates(({ email, password, confirmPassword }) => ({
 *     isEmailValid: computed(() => {
 *       const value = email();
 *       return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
 *     }),
 *     isPasswordValid: computed(() => {
 *       const value = password();
 *       return value.length >= 8;
 *     }),
 *     doPasswordsMatch: computed(() => {
 *       return password() === confirmPassword();
 *     }),
 *     isFormValid: computed(() => {
 *       const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email());
 *       const passwordValid = password().length >= 8;
 *       const passwordsMatch = password() === confirmPassword();
 *
 *       return emailValid && passwordValid && passwordsMatch;
 *     }),
 *     validationErrors: computed(() => {
 *       const errors: string[] = [];
 *
 *       if (email() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email())) {
 *         errors.push('Invalid email format');
 *       }
 *       if (password() && password().length < 8) {
 *         errors.push('Password must be at least 8 characters');
 *       }
 *       if (confirmPassword() && password() !== confirmPassword()) {
 *         errors.push('Passwords do not match');
 *       }
 *
 *       return errors;
 *     }),
 *   }))
 * );
 *
 * const store = injectCraft();
 *
 * // Use in template
 * // <button [disabled]="!store.isFormValid()">Submit</button>
 * // @for (error of store.validationErrors(); track error) {
 * //   <div class="error">{{ error }}</div>
 * // }
 * ```
 */
export function craftComputedStates<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  Computed extends {},
>(
  computedFactory: (context: CraftFactoryEntries<Context>) => Computed,
): CraftComputedStatesOutputs<Context, StoreConfig, Computed> {
  return () => (contextData) => {
    const computedValues = computedFactory(
      craftFactoryEntries(contextData),
    ) as Record<string, Signal<unknown>>;

    return partialContext({
      props: computedValues,
    }) as SpecificCraftComputedOutputs<Computed>;
  };
}
