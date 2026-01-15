import {
  computed,
  isSignal,
  resource,
  ResourceLoaderParams,
  ResourceOptions,
  ResourceStreamingLoader,
  signal,
  WritableSignal,
} from '@angular/core';
import { InsertionsResourcesFactory } from './query.core';
import { ReadonlySource } from './util/source.type';
import { resourceById, ResourceByIdRef } from './resource-by-id';
import { isSource } from './util/util';

// ! It looks like TS does not handle to expose the ResourceByIdHandler without erasing the () => ... part
export type AsyncMethodRef<
  Value,
  ArgParams,
  Params,
  Insertions,
  IsMethod,
  SourceParams,
  GroupIdentifier,
> = MergeObjects<
  [
    [unknown] extends [GroupIdentifier]
      ? {
          readonly value: Signal<Value | undefined>;
          readonly status: Signal<ResourceStatus>;
          readonly error: Signal<Error | undefined>;
          readonly isLoading: Signal<boolean>;
          hasValue(): boolean;
        }
      : {},
    Insertions,
    IsMethod extends true
      ? {
          method: (args: ArgParams) => Params;
        }
      : {
          source: ReadonlySource<SourceParams>;
        },
    [unknown] extends [GroupIdentifier]
      ? {}
      : ResourceByIdRef<GroupIdentifier & string, Value, Params> & {
          _resourceById: ResourceByIdRef<
            GroupIdentifier & string,
            Value,
            Params
          >;
          /**
           * Get the associated resource by id
           *
           * Only added to help TS inference (TS cannot infer ResourceByIdHandler without erasing the signal getter, () => ResourceByIdRef<...>) )
           *
           * return the associated resource or undefined if not existing
           */
          select: (id: GroupIdentifier) =>
            | {
                readonly value: Signal<Value | undefined>;
                readonly status: Signal<ResourceStatus>;
                readonly error: Signal<Error | undefined>;
                readonly isLoading: Signal<boolean>;
                hasValue(): boolean;
              }
            | undefined;
        },
  ]
>;

type AsyncMethodConfig<
  ResourceState,
  Params,
  ParamsArgs,
  SourceParams,
  GroupIdentifier,
> = Omit<ResourceOptions<NoInfer<ResourceState>, Params>, 'params' | 'loader'> &
  (
    | {
        /**
         * Used to generate a method in the store, when called will trigger the resource loader/stream.
         *
         * Only support one parameter which can be an object to pass multiple parameters.
         */
        method: ((args: ParamsArgs) => Params) | ReadonlySource<SourceParams>;
        /**
         * A unique identifier for the resource, derived from the params.
         * It should be a string that uniquely identifies the resource based on the params.
         */
        identifier?: (params: NoInfer<NonNullable<Params>>) => GroupIdentifier;
        loader: (
          param: ResourceLoaderParams<
            NonNullable<
              [unknown] extends [Params]
                ? NoInfer<SourceParams>
                : NoInfer<Params>
            >
          >,
        ) => Promise<ResourceState>;
        stream?: never;
        preservePreviousValue?: () => boolean;
      }
    | {
        method: ((args: ParamsArgs) => Params) | ReadonlySource<SourceParams>;
        loader?: never;
        identifier?: (params: NoInfer<NonNullable<Params>>) => GroupIdentifier;
        /**
         * Loading function which returns a `Promise` of a signal of the resource's value for a given
         * request, which can change over time as new values are received from a stream.
         */
        stream: ResourceStreamingLoader<
          ResourceState,
          ResourceLoaderParams<
            NonNullable<
              [unknown] extends [Params]
                ? NoInfer<SourceParams>
                : NoInfer<Params>
            >
          >
        >;
        preservePreviousValue?: () => boolean;
      }
  );

export type AsyncMethodOutput<
  State extends object | undefined,
  Params,
  ArgParams,
  SourceParams,
  GroupIdentifier,
  Insertions,
> = AsyncMethodRef<
  State,
  ArgParams,
  Params,
  Insertions,
  [unknown] extends [ArgParams] ? false : true, // ! force to method to have one arg minimum, we can not compare SourceParams type, because it also infer Params
  SourceParams,
  GroupIdentifier
>;

// todo add wrapping js native api

/**
 * Creates an async method that manages asynchronous operations with automatic state tracking.
 *
 * This function creates a reactive async operation by:
 * - Managing loading, resolved, error, and idle states automatically
 * - Supporting both method-based (manual) and source-based (automatic) triggering
 * - Enabling parallel execution with identifiers
 * - Providing signals for value, status, error, and loading state
 * - Supporting streaming data with progressive updates
 * - Enabling custom insertions for extending functionality
 *
 * @remarks
 * **Trigger Patterns:**
 * - **Method-based**: Explicit `method` function returns params, called manually
 * - **Source-based**: Bound to a source using `afterRecomputation()`, triggers automatically
 *
 * **Use Cases:**
 * - **Debounced operations**: Search, validation with delay
 * - **Background tasks**: Processing without blocking UI
 * - **Polling**: Periodic data updates
 *
 * **State Management:**
 * - `idle`: Initial state, no operation started
 * - `loading`: Operation in progress
 * - `resolved`: Operation completed successfully
 * - `error`: Operation failed
 *
 * **Identifier Usage:**
 * - Without identifier: Single global state for the async method
 * - With identifier: Multiple parallel instances with independent states
 * - Useful for parallel file uploads, concurrent API calls
 *
 * **Insertions:**
 * - Extend functionality with custom insertions
 * - Examples: persistence, caching, retry logic
 * - Insertions receive access to resource state and params
 *
 * @template AsyncMethodState - The type of data returned by the async operation
 * @template AsyncMethodParams - The type of params passed to the loader
 * @template AsyncMethodArgsParams - The type of arguments for the method function
 * @template SourceParams - The type emitted by the source (for source-based methods)
 * @template GroupIdentifier - The type of identifier for parallel execution
 *
 * @param asyncMethodConfig - Configuration object:
 *   - `method`: Function returning params OR source for automatic triggering
 *   - `loader`: Async function that performs the operation (mutually exclusive with `stream`)
 *   - `stream`: Streaming loader for progressive updates (mutually exclusive with `loader`)
 *   - `identifier`: Optional function to derive unique ID for parallel execution
 *
 * @returns An async method reference with:
 *   - `value`: Signal containing the result (or undefined)
 *   - `status`: Signal with current state ('idle' | 'loading' | 'resolved' | 'error')
 *   - `error`: Signal containing error (or undefined)
 *   - `isLoading`: Signal for loading state
 *   - `hasValue()`: Function to check if value exists
 *   - `method`: (method-based only) Function to trigger the operation
 *   - `source`: (source-based only) Readonly source for automatic triggering
 *   - `select(id)`: (with identifier) Access individual instance by ID
 *
 * @example
 * Basic method-based async method
 * ```ts
 * const search = asyncMethod({
 *   method: (searchTerm: string) => searchTerm,
 *   loader: async ({ params }) => {
 *     const response = await fetch(`/api/search?q=${params}`);
 *     return response.json();
 *   },
 * });
 *
 * // Trigger manually
 * search.method('query text');
 *
 * // Track state
 * console.log(search.status()); // 'loading'
 * console.log(search.isLoading()); // true
 *
 * // After completion
 * console.log(search.status()); // 'resolved'
 * console.log(search.value()); // Search results
 * console.log(search.hasValue()); // true
 * ```
 *
 * @example
 * Source-based async method for automatic execution
 * ```ts
 * const searchSource = source<string>();
 *
 * const autoSearch = asyncMethod({
 *   method: afterRecomputation(searchSource, (term) => term),
 *   loader: async ({ params }) => {
 *     // Debounce at source level
 *     await new Promise(resolve => setTimeout(resolve, 300));
 *     const response = await fetch(`/api/search?q=${params}`);
 *     return response.json();
 *   },
 * });
 *
 * // Triggers automatically when source emits
 * searchSource.set('query text');
 * // -> autoSearch executes automatically
 *
 * // No manual method, only source
 * console.log(autoSearch.source); // ReadonlySource<string>
 * console.log(autoSearch.status()); // Current state
 * ```
 *
 * @example
 * Async method with identifier for parallel operations
 * ```ts
 * const uploadFile = asyncMethod({
 *   method: (file: File) => ({ id: file.name, file }),
 *   identifier: (params) => params.id,
 *   loader: async ({ params }) => {
 *     const formData = new FormData();
 *     formData.append('file', params.file);
 *
 *     const response = await fetch('/api/upload', {
 *       method: 'POST',
 *       body: formData,
 *     });
 *     return response.json();
 *   },
 * });
 *
 * // Upload multiple files in parallel
 * uploadFile.method(file1);
 * uploadFile.method(file2);
 * uploadFile.method(file3);
 *
 * // Access individual states
 * const file1Upload = uploadFile.select(file1.name);
 * console.log(file1Upload?.status()); // 'loading' or 'resolved'
 * console.log(file1Upload?.value()); // Upload result for file1
 *
 * const file2Upload = uploadFile.select(file2.name);
 * console.log(file2Upload?.status()); // Independent state
 * ```
 *
 * @example
 * Streaming async method for progressive updates
 * ```ts
 * const streamChat = asyncMethod({
 *   method: (message: string) => message,
 *   stream: async ({ params }) => {
 *     const response = await fetch('/api/chat/stream', {
 *       method: 'POST',
 *       body: JSON.stringify({ message: params }),
 *     });
 *
 *     const reader = response.body?.getReader();
 *     const decoder = new TextDecoder();
 *
 *     return rxResource({
 *       loader: async () => {
 *         const result = signal({ text: '', complete: false });
 *
 *         while (true) {
 *           const { done, value } = await reader!.read();
 *           if (done) {
 *             result.update(prev => ({ ...prev, complete: true }));
 *             break;
 *           }
 *
 *           const chunk = decoder.decode(value);
 *           result.update(prev => ({ text: prev.text + chunk, complete: false }));
 *         }
 *
 *         return result.asReadonly();
 *       },
 *     });
 *   },
 * });
 *
 * // Trigger streaming
 * streamChat.method('Hello AI!');
 *
 * // Value updates progressively
 * effect(() => {
 *   const response = streamChat.value();
 *   console.log('Current:', response?.text);
 *   console.log('Complete:', response?.complete);
 * });
 * ```
 *
 * @example
 * Async method with custom insertion for persistence
 * ```ts
 * const fetchUser = asyncMethod(
 *   {
 *     method: (userId: string) => userId,
 *     loader: async ({ params }) => {
 *       const response = await fetch(`/api/users/${params}`);
 *       return response.json();
 *     },
 *   },
 *   insertLocalStoragePersister({
 *     key: 'user-cache',
 *     maxAge: 5 * 60 * 1000, // 5 minutes
 *   })
 * );
 *
 * // First call fetches from API and caches
 * fetchUser.method('user-123');
 *
 * // Subsequent calls within 5 minutes load from cache
 * fetchUser.method('user-123'); // Instant from localStorage
 *
 * // Custom insertion adds caching behavior
 * ```
 *
 * @example
 * Error handling and retry logic
 * ```ts
 * const fetchWithRetry = asyncMethod({
 *   method: (url: string) => url,
 *   loader: async ({ params }) => {
 *     let attempts = 0;
 *     const maxAttempts = 3;
 *
 *     while (attempts < maxAttempts) {
 *       try {
 *         const response = await fetch(params);
 *
 *         if (!response.ok) {
 *           throw new Error(`HTTP ${response.status}`);
 *         }
 *
 *         return response.json();
 *       } catch (error) {
 *         attempts++;
 *         if (attempts >= maxAttempts) throw error;
 *
 *         // Wait before retry
 *         await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
 *       }
 *     }
 *
 *     throw new Error('Max retries exceeded');
 *   },
 * });
 *
 * // Automatically retries on failure
 * fetchWithRetry.method('/api/unstable-endpoint');
 *
 * // Track error state
 * effect(() => {
 *   const error = fetchWithRetry.error();
 *   if (error) {
 *     console.error('Failed after retries:', error.message);
 *   }
 * });
 * ```
 *
 * @example
 * Coordinating multiple async methods
 * ```ts
 * const validateStep1 = asyncMethod({
 *   method: (data: unknown) => data,
 *   loader: async ({ params }) => {
 *     await new Promise(resolve => setTimeout(resolve, 500));
 *     return { valid: true, data: params };
 *   },
 * });
 *
 * const validateStep2 = asyncMethod({
 *   method: (data: unknown) => data,
 *   loader: async ({ params }) => {
 *     await new Promise(resolve => setTimeout(resolve, 500));
 *     return { valid: true, data: params };
 *   },
 * });
 *
 * // Sequential execution
 * async function runValidation(input: unknown) {
 *   validateStep1.method(input);
 *
 *   // Wait for step 1
 *   await new Promise(resolve => {
 *     const unsubscribe = effect(() => {
 *       if (validateStep1.status() === 'resolved') {
 *         unsubscribe();
 *         resolve(undefined);
 *       }
 *     });
 *   });
 *
 *   // Run step 2 with step 1 result
 *   const step1Result = validateStep1.value();
 *   if (step1Result?.valid) {
 *     validateStep2.method(step1Result.data);
 *   }
 * }
 * ```
 */
export function asyncMethod<
  AsyncMethodState extends object | undefined,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
>(
  asyncMethodConfig: AsyncMethodConfig<
    AsyncMethodState,
    AsyncMethodParams,
    AsyncMethodArgsParams,
    SourceParams,
    GroupIdentifier
  >,
): AsyncMethodOutput<
  AsyncMethodState,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  {}
>;
export function asyncMethod<
  AsyncMethodState extends object | undefined,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
>(
  asyncMethodConfig: AsyncMethodConfig<
    AsyncMethodState,
    AsyncMethodParams,
    AsyncMethodArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion1
  >,
): AsyncMethodOutput<
  AsyncMethodState,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1
>;
export function asyncMethod<
  AsyncMethodState extends object | undefined,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
  Insertion2,
>(
  asyncMethodConfig: AsyncMethodConfig<
    AsyncMethodState,
    AsyncMethodParams,
    AsyncMethodArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion2,
    Insertion1
  >,
): AsyncMethodOutput<
  AsyncMethodState,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2
>;
export function asyncMethod<
  AsyncMethodState extends object | undefined,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
  Insertion2,
  Insertion3,
>(
  asyncMethodConfig: AsyncMethodConfig<
    AsyncMethodState,
    AsyncMethodParams,
    AsyncMethodArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion3,
    Insertion1 & Insertion2
  >,
): AsyncMethodOutput<
  AsyncMethodState,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3
>;
export function asyncMethod<
  AsyncMethodState extends object | undefined,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
>(
  asyncMethodConfig: AsyncMethodConfig<
    AsyncMethodState,
    AsyncMethodParams,
    AsyncMethodArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
): AsyncMethodOutput<
  AsyncMethodState,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4
>;
export function asyncMethod<
  AsyncMethodState extends object | undefined,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
>(
  asyncMethodConfig: AsyncMethodConfig<
    AsyncMethodState,
    AsyncMethodParams,
    AsyncMethodArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
): AsyncMethodOutput<
  AsyncMethodState,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
>;
export function asyncMethod<
  AsyncMethodState extends object | undefined,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
>(
  asyncMethodConfig: AsyncMethodConfig<
    AsyncMethodState,
    AsyncMethodParams,
    AsyncMethodArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
  insertion6: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
  >,
): AsyncMethodOutput<
  AsyncMethodState,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6
>;
export function asyncMethod<
  AsyncMethodState extends object | undefined,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  Insertion7,
>(
  asyncMethodConfig: AsyncMethodConfig<
    AsyncMethodState,
    AsyncMethodParams,
    AsyncMethodArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
  insertion6: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
  >,
  insertion7: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncMethodState>,
    NoInfer<AsyncMethodParams>,
    Insertion7,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6
  >,
): AsyncMethodOutput<
  AsyncMethodState,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 &
    Insertion2 &
    Insertion3 &
    Insertion4 &
    Insertion5 &
    Insertion6 &
    Insertion7
>;
export function asyncMethod<
  AsyncMethodState extends object | undefined,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
>(
  asyncMethodConfig: AsyncMethodConfig<
    AsyncMethodState,
    AsyncMethodParams,
    AsyncMethodArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  ...insertions: any[]
): AsyncMethodOutput<
  AsyncMethodState,
  AsyncMethodParams,
  AsyncMethodArgsParams,
  SourceParams,
  GroupIdentifier,
  {}
> {
  const asyncmethodResourceParamsFnSignal = signal<
    AsyncMethodParams | undefined
  >(undefined);

  const isConnectedToSource = isSource(asyncMethodConfig.method);

  const isUsingIdentifier = 'identifier' in asyncMethodConfig;

  const resourceParamsSrc = isConnectedToSource
    ? asyncMethodConfig.method
    : asyncmethodResourceParamsFnSignal;

  const resourceTarget = isUsingIdentifier
    ? resourceById<
        AsyncMethodState,
        AsyncMethodParams,
        GroupIdentifier & string,
        string,
        unknown,
        unknown
      >({
        ...asyncMethodConfig,
        params: resourceParamsSrc,
        identifier: asyncMethodConfig.identifier,
      } as any)
    : resource<AsyncMethodState, AsyncMethodParams>({
        ...asyncMethodConfig,
        params: resourceParamsSrc,
      } as ResourceOptions<any, any>);

  return Object.assign(
    resourceTarget,
    // byId is used to helps TS to correctly infer the resourceByGroup
    isUsingIdentifier
      ? {
          /**
           * Only added to help TS inference (TS cannot infer ResourceByIdHandler without erasing the signal getter, () => ResourceByIdRef<...>) )
           */
          _resourceById: resourceTarget as ResourceByIdRef<
            GroupIdentifier & string,
            AsyncMethodState,
            AsyncMethodParams
          >,
          select: (id: GroupIdentifier) => {
            return computed(() => {
              const list = (
                resourceTarget as ResourceByIdRef<
                  GroupIdentifier & string,
                  AsyncMethodState,
                  AsyncMethodParams
                >
              )();
              //@ts-expect-error GroupIdentifier & string is not recognized correctly
              return list[id];
            })();
          },
        }
      : {},
    {
      method: isSignal(asyncMethodConfig.method)
        ? undefined
        : (arg: AsyncMethodArgsParams) => {
            const result = asyncMethodConfig.method(arg);
            if (isUsingIdentifier) {
              const id = asyncMethodConfig.identifier?.(arg as any);
              (
                resourceTarget as ResourceByIdRef<
                  GroupIdentifier & string,
                  AsyncMethodState,
                  AsyncMethodParams
                >
              ).addById(id as GroupIdentifier & string);
            }
            asyncmethodResourceParamsFnSignal.set(result as AsyncMethodParams);
            return result;
          },
    },
    (
      insertions as InsertionsResourcesFactory<
        NoInfer<GroupIdentifier>,
        NoInfer<AsyncMethodState>,
        NoInfer<AsyncMethodParams>,
        {}
      >[]
    )?.reduce(
      (acc, insert) => {
        return {
          ...acc,
          ...insert({
            ...(isUsingIdentifier
              ? { resourceById: resourceTarget }
              : { resource: resourceTarget }),
            resourceParamsSrc: resourceParamsSrc as WritableSignal<
              NoInfer<AsyncMethodParams>
            >,
            insertions: acc as {},
          } as any),
        };
      },
      {} as Record<string, unknown>,
    ),
  ) as unknown as AsyncMethodOutput<
    AsyncMethodState,
    AsyncMethodParams,
    AsyncMethodArgsParams,
    SourceParams,
    GroupIdentifier,
    {}
  >;
}
