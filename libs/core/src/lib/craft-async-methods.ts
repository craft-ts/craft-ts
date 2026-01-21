import { ResourceStatus, Signal } from '@angular/core';
import {
  ContextConstraints,
  craftFactoryEntries,
  CraftFactoryEntries,
  CraftFactoryUtility,
  PartialContext,
  partialContext,
  StoreConfigConstraints,
} from './craft';
import { capitalize } from './util/util';
import {
  FilterMethodsBoundToSources,
  Prettify,
  UnionToTuple,
} from './util/util.type';
import { AsyncMethodRef } from './async-method';

type SpecificCraftAsyncMethodsOutputs<AsyncMethods extends {}> =
  PartialContext<{
    props: {
      [key in keyof AsyncMethods]: Prettify<Omit<AsyncMethods[key], 'method'>>;
    };
    methods: FilterMethodsBoundToSources<
      AsyncMethods,
      UnionToTuple<keyof AsyncMethods>,
      'set',
      'method'
    >;
    _asyncMethods: {
      [key in keyof AsyncMethods]: Prettify<Omit<AsyncMethods[key], 'method'>>;
    };
  }>;

type CraftAsyncMethodsOutputs<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  AsyncMethods extends {},
> = CraftFactoryUtility<
  Context,
  StoreConfig,
  SpecificCraftAsyncMethodsOutputs<AsyncMethods>
>;

/**
 * Creates async method definitions for use within a craft store, enabling reactive management of asynchronous operations.
 *
 * This function integrates multiple `asyncMethod()` instances into a craft store by:
 * - Registering async methods as a group with automatic state tracking
 * - Generating prefixed `set` methods for each async method (e.g., `setMethodName`)
 * - Exposing async method state signals (value, status, error, isLoading)
 * - Supporting both method-based and source-based async method triggering
 * - Managing async methods with identifiers for parallel execution
 * - Enabling insertions for extending functionality (persistence, etc.)
 *
 * @remarks
 * **Naming Convention:**
 * - Async methods are accessible as: `store.methodName` (returns signals and state)
 * - Trigger methods are prefixed: `store.setMethodName(args)`
 * - Source-based async methods (bound to sources) don't expose `set` methods
 *
 * **Difference from Mutations:**
 * - **Async Methods**: General-purpose async operations without automatic query coordination
 * - **Mutations**: Server data modifications with built-in query synchronization patterns
 * - Use async methods for operations like debounced search, background tasks
 * - Use mutations for CRUD operations that should update query caches
 *
 * **Use Cases:**
 * - **Debounced operations**: Search, validation, autosave with delay
 * - **Background tasks**: Processing, computation without blocking UI
 * - **Third-party APIs**: External service calls with status tracking
 * - **Polling**: Periodic checks or updates
 * - **Cancellable operations**: Long-running tasks with abort capability
 *
 * **Context Access:**
 * The async methods factory receives full access to the craft context:
 * - Sources: Bind async methods to sources for automatic execution
 * - Queries: Access query state for conditional logic
 * - States: Read and react to state changes
 * - Injections: Access Angular services and dependencies
 *
 * **Store Integration:**
 * - Async method state accessible as: `store.methodName.value()`, `store.methodName.status()`
 * - Trigger async methods: `store.setMethodName(args)`
 * - With identifier: `store.methodName.select(id)` for individual instances
 * - Context access: Other craft entries can access async methods for coordination
 *
 * @template Context - The craft store context type
 * @template StoreConfig - The craft store configuration type
 * @template AsyncMethods - Record of async method names to async method instances
 *
 * @param asyncMethodsFactory - Factory function that receives the craft context and returns a record of async methods.
 *   Has access to all other craft entries (sources, queries, states, injections) defined before it.
 *
 * @returns A craft factory utility that integrates async methods into the store with:
 *   - `store.methodName`: Async method state and signals
 *   - `store.setMethodName(args)`: Method to trigger the async operation (for method-based async methods)
 *   - Full type safety for async method parameters and results
 *
 * @example
 * Basic method-based async method
 * ```ts
 * const delay = asyncMethod({
 *   method: (delay: number) => delay,
 *   loader: async ({ params }) => {
 *     await new Promise(resolve => setTimeout(resolve, 500)); // Simulate delay
 *     return 'done';
 *   },
 * });
 *
 * // Trigger manually
 * delay.method(500);
 *
 * // Track state
 * console.log(delay.status()); // 'loading'
 * console.log(delay.isLoading()); // true
 *
 * // After completion
 * console.log(delay.status()); // 'resolved'
 * console.log(delay.value()); // 'done'
 * console.log(delay.hasValue()); // true
 * ```
 *
 * @example
 * Source-based async method for automatic execution
 * ```ts
 * const delaySource = source<number>();
 *
 * const delay = asyncMethod({
 *   method: afterRecomputation(delaySource, (term) => term),
 *   loader: async ({ params }) => {
 *     // Debounce at source level
 *     await new Promise(resolve => setTimeout(resolve, 300));
 *     return 'done';
 *   },
 * });
 *
 * // Triggers automatically when source emits
 * delaySource.set(500);
 * // -> delay executes automatically
 *
 * // No manual method, only source
 * console.log(delay.source); // ReadonlySource<number>
 * console.log(delay.status()); // Current state
 * ```
 *
 * @example
 * Async method with identifier for parallel operations
 * ```ts
 * const delayById = asyncMethod({
 *   method: (id: string) => id,
 *   identifier: (id) => id,
 *   loader: async () => {
 *     await new Promise(resolve => setTimeout(resolve, 300));
 *     return 'done'; // Simulate delay
 *   },
 * });
 *
 * delayById.method('id1');
 * delayById.method('id2');
 * delayById.method('id3');
 *
 * // Access individual states
 * const delay1 = delayById.select('id1');
 * console.log(delay1?.status()); // 'loading' or 'resolved'
 * console.log(delay1?.value()); // 'done'
 *
 * const delay2 = delayById.select('id2');
 * console.log(delay2?.status()); // Independent state
 * ```
 *
 * @example
 * Calling async js native API
 * ```ts
 * const shareContent = asyncMethod({
 *   method: (payload: { title: string, url: string }) => payload,
 *   stream: async ({ params }) => {
 *      return navigator.share(params);
 *   },
 * }, ({resource}) => ({isMenuOpen: computed(() => resource.status() === 'loading')} ));
 *
 * // Trigger shareContent
 * shareContent.method({ title: 'Hello AI!', url: 'https://example.com' });
 * shareContent.isMenuOpen(); // true while loading
 *
 * ```
 */
export function craftAsyncMethods<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  AsyncMethods extends {},
>(
  asyncMethodsFactory: (context: CraftFactoryEntries<Context>) => AsyncMethods,
): CraftAsyncMethodsOutputs<Context, StoreConfig, AsyncMethods> {
  return (_cloudProxy) => (contextData) => {
    const asyncMethods = asyncMethodsFactory(
      craftFactoryEntries(contextData),
    ) as Record<
      string,
      AsyncMethodRef<
        unknown,
        unknown,
        unknown,
        unknown,
        unknown,
        unknown,
        unknown
      >
    >;

    const { methods, resourceRefs } = Object.entries(asyncMethods ?? {}).reduce(
      (acc, [methodName, asyncMethodRef]) => {
        const methodValue =
          'method' in asyncMethodRef ? asyncMethodRef.method : undefined;
        if (!methodValue) {
          acc.resourceRefs[methodName] = asyncMethodRef;
          return acc;
        }
        acc.resourceRefs[methodName] = {
          ...asyncMethodRef,
        };
        acc.methods[`set${capitalize(methodName)}`] = methodValue as Function;
        return acc;
      },
      {
        methods: {},
        resourceRefs: {},
      } as {
        resourceRefs: Record<
          string,
          Omit<
            AsyncMethodRef<
              unknown,
              unknown,
              unknown,
              unknown,
              unknown,
              unknown,
              unknown
            >,
            'method' | 'source'
          >
        >;
        methods: Record<string, Function>;
      },
    );

    return partialContext({
      props: resourceRefs,
      methods,
      _asyncMethods: resourceRefs,
    }) as unknown as SpecificCraftAsyncMethodsOutputs<AsyncMethods>;
  };
}
