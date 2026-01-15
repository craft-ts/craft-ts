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
import { ReadonlySource } from './util/source.type';
import { capitalize } from './util/util';
import {
  FilterMethodsBoundToSources,
  MergeObjects,
  Prettify,
  UnionToTuple,
} from './util/util.type';
import { ResourceByIdRef } from './resource-by-id';

type SpecificCraftAsyncMethodsOutputs<AsyncMethods extends {}> =
  PartialContext<{
    props: {
      [key in keyof AsyncMethods]: Prettify<Omit<AsyncMethods[key], 'method'>>;
    };
    methods: FilterMethodsBoundToSources<
      AsyncMethods,
      UnionToTuple<keyof AsyncMethods>,
      'method',
      'set'
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
 * - Use async methods for operations like debounced search, file uploads, background tasks
 * - Use mutations for CRUD operations that should update query caches
 *
 * **Use Cases:**
 * - **Debounced operations**: Search, validation, autosave with delay
 * - **File operations**: Upload, download with progress tracking
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
 * Basic async method for debounced search
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'SearchStore', providedIn: 'root' },
 *   craftAsyncMethods(() => ({
 *     search: asyncMethod({
 *       method: (searchTerm: string) => searchTerm,
 *       loader: async ({ params }) => {
 *         // Debounce happens at call site
 *         await new Promise(resolve => setTimeout(resolve, 300));
 *
 *         const response = await fetch(`/api/search?q=${params}`);
 *         return response.json();
 *       },
 *     }),
 *   }))
 * );
 *
 * const store = injectCraft();
 *
 * // Trigger search
 * store.setSearch('query text');
 *
 * // Track status
 * console.log(store.search.status()); // 'loading'
 * console.log(store.search.isLoading()); // true
 *
 * // After completion
 * console.log(store.search.status()); // 'resolved'
 * console.log(store.search.value()); // Search results
 * ```
 *
 * @example
 * Async method with identifier for parallel operations
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'FileStore', providedIn: 'root' },
 *   craftAsyncMethods(() => ({
 *     uploadFile: asyncMethod({
 *       method: (file: File) => ({ fileId: file.name, file }),
 *       identifier: (params) => params.fileId,
 *       loader: async ({ params }) => {
 *         const formData = new FormData();
 *         formData.append('file', params.file);
 *
 *         const response = await fetch('/api/upload', {
 *           method: 'POST',
 *           body: formData,
 *         });
 *         return response.json();
 *       },
 *     }),
 *   }))
 * );
 *
 * const store = injectCraft();
 *
 * // Upload multiple files in parallel
 * store.setUploadFile(file1);
 * store.setUploadFile(file2);
 * store.setUploadFile(file3);
 *
 * // Track individual upload states
 * const file1Upload = store.uploadFile.select(file1.name);
 * console.log(file1Upload?.status()); // 'loading' or 'resolved'
 * console.log(file1Upload?.value()); // Upload result
 *
 * const file2Upload = store.uploadFile.select(file2.name);
 * console.log(file2Upload?.status()); // Independent state
 * ```
 *
 * @example
 * Source-based async method for automatic execution
 * ```ts
 * const { injectCraft } = craft(
 *   { name: 'AutoSaveStore', providedIn: 'root' },
 *   craftSources({
 *     formChange: source<FormData>(),
 *   }),
 *   craftAsyncMethods(({ formChange }) => ({
 *     autoSave: asyncMethod({
 *       method: afterRecomputation(formChange, (data) => data),
 *       loader: async ({ params }) => {
 *         // Wait 2 seconds before saving
 *         await new Promise(resolve => setTimeout(resolve, 2000));
 *
 *         const response = await fetch('/api/autosave', {
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
 * // Async method executes automatically when source emits
 * store.setFormChange({ name: 'John', email: 'john@example.com' });
 * // -> autoSave async method executes automatically after 2s
 * // Note: No store.setAutoSave method exposed (source-based)
 *
 * // Access async method state
 * console.log(store.autoSave.status()); // 'loading'
 * console.log(store.autoSave.value()); // Result after completion
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
