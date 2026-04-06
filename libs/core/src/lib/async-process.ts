import {
  computed,
  isSignal,
  ResourceLoaderParams,
  ResourceOptions,
  ResourceStatus,
  ResourceStreamingLoader,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { InsertionsResourcesFactory } from './query.core';
import { ReadonlySource } from './util/source.type';
import { resourceById, ResourceByIdRef } from './resource-by-id';
import { isSource } from './util/util';
import { MergeObjects } from './util/util.type';
import { craftResource } from './craft-resource';
import {
  AnyCraftException,
  ExtractCraftException,
  InsertMetaInCraftExceptionIfExists,
  StripCraftException,
  isCraftException,
} from './craft-exception';
import {
  createResourceExceptionsRuntime,
  enrichResourceException,
} from './resource-exception';

// ! It looks like TS does not handle to expose the ResourceByIdHandler without erasing the () => ... part
export type AsyncProcessRef<
  Value,
  ArgParams,
  Params,
  Insertions,
  IsMethod,
  SourceParams,
  GroupIdentifier,
  AsyncProcessExceptions extends
    AsyncProcessExceptionConstraints = AsyncProcessExceptionConstraints,
> = MergeObjects<
  [
    [unknown] extends [GroupIdentifier]
      ? {
          readonly value: Signal<Value | undefined>;
          readonly status: Signal<ResourceStatus>;
          readonly error: Signal<Error | undefined>;
          readonly isLoading: Signal<boolean>;
          readonly safeValue: Signal<Value | undefined>;
          hasValue(): boolean;
        } & ResourceLikeAsyncProcessExceptions<AsyncProcessExceptions>
      : {},
    Insertions,
    IsMethod extends true
      ? {
          method: (args: ArgParams) => Params;
        }
      : IsMethod extends 'params'
        ? {
            readonly resourceParamsSrc: Signal<Params | undefined>;
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
            | ({
                readonly value: Signal<Value | undefined>;
                readonly status: Signal<ResourceStatus>;
                readonly error: Signal<Error | undefined>;
                readonly isLoading: Signal<boolean>;
                readonly safeValue: Signal<Value | undefined>;
                hasValue(): boolean;
              } & ResourceLikeAsyncProcessExceptions<
                AsyncProcessExceptions,
                GroupIdentifier
              >)
            | undefined;
        } & ([GroupIdentifier] extends [string]
            ? ResourceByIdLikeAsyncProcessExceptions<
                AsyncProcessExceptions,
                GroupIdentifier
              >
            : {}),
  ]
>;

type AsyncProcessConfig<
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
        identifier?: (
          params: NoInfer<NonNullable<StripCraftException<Params>>>,
        ) => GroupIdentifier;
        loader: (
          param: ResourceLoaderParams<
            NonNullable<
              [unknown] extends [Params]
                ? NoInfer<StripCraftException<SourceParams>>
                : NoInfer<StripCraftException<Params>>
            >
          >,
        ) => Promise<ResourceState>;
        params?: never;
        stream?: never;
        preservePreviousValue?: () => boolean;
      }
    | {
        method: ((args: ParamsArgs) => Params) | ReadonlySource<SourceParams>;
        loader?: never;
        identifier?: (
          params: NoInfer<NonNullable<StripCraftException<Params>>>,
        ) => GroupIdentifier;
        /**
         * Loading function which returns a `Promise` of a signal of the resource's value for a given
         * request, which can change over time as new values are received from a stream.
         */
        stream: ResourceStreamingLoader<
          ResourceState,
          ResourceLoaderParams<
            NonNullable<
              [unknown] extends [Params]
                ? NoInfer<StripCraftException<SourceParams>>
                : NoInfer<StripCraftException<Params>>
            >
          >
        >;
        params?: never;
        preservePreviousValue?: () => boolean;
      }
    | {
        /**
         * A reactive function which determines the request to be made. Whenever the request changes, the
         * loader will be triggered to fetch a new value for the resource.
         */
        params: () => Params;
        /**
         * A unique identifier for the resource, derived from the params.
         * It should be a string that uniquely identifies the resource based on the params.
         */
        identifier?: (
          params: NoInfer<NonNullable<StripCraftException<Params>>>,
        ) => GroupIdentifier;
        loader: (
          param: ResourceLoaderParams<
            NonNullable<NoInfer<StripCraftException<Params>>>
          >,
        ) => Promise<ResourceState>;
        method?: never;
        stream?: never;
        preservePreviousValue?: () => boolean;
      }
  );

export type AsyncProcessExceptionConstraints = {
  params: AnyCraftException;
  loader: AnyCraftException;
};

export type ResourceLikeAsyncProcessExceptions<
  AsyncProcessException extends
    AsyncProcessExceptionConstraints = AsyncProcessExceptionConstraints,
  GroupIdentifier = unknown,
> = {
  hasException: Signal<boolean>;
  exceptions: Signal<{
    list: (
      | InsertMetaInCraftExceptionIfExists<
          AsyncProcessException['params'],
          'params',
          GroupIdentifier
        >
      | InsertMetaInCraftExceptionIfExists<
          AsyncProcessException['loader'],
          'loader',
          GroupIdentifier
        >
    )[];
    params?: InsertMetaInCraftExceptionIfExists<
      AsyncProcessException['params'],
      'params',
      unknown
    >;
    loader?: InsertMetaInCraftExceptionIfExists<
      AsyncProcessException['loader'],
      'loader',
      GroupIdentifier
    >;
  }>;
};

export type ResourceByIdLikeAsyncProcessExceptions<
  AsyncProcessException extends
    AsyncProcessExceptionConstraints = AsyncProcessExceptionConstraints,
  GroupIdentifier extends string = string,
> = {
  hasException: Signal<boolean>;
  exceptions: Signal<{
    list: (
      | InsertMetaInCraftExceptionIfExists<
          AsyncProcessException['params'],
          'params',
          unknown
        >
      | InsertMetaInCraftExceptionIfExists<
          AsyncProcessException['loader'],
          'loader',
          GroupIdentifier
        >
    )[];
    params?: InsertMetaInCraftExceptionIfExists<
      AsyncProcessException['params'],
      'params',
      unknown
    >;
    loader: Partial<
      Record<
        GroupIdentifier,
        InsertMetaInCraftExceptionIfExists<
          AsyncProcessException['loader'],
          'loader',
          GroupIdentifier
        >
      >
    >;
  }>;
};

export type AsyncProcessOutput<
  State extends object | undefined,
  Params,
  ArgParams,
  SourceParams,
  GroupIdentifier,
  Insertions,
  AsyncProcessExceptions extends AsyncProcessExceptionConstraints,
> = AsyncProcessRef<
  StripCraftException<State>,
  ArgParams,
  StripCraftException<Params>,
  Insertions,
  [unknown] extends [ArgParams]
    ? [unknown] extends [SourceParams]
      ? 'params'
      : false
    : true, // ! force to method to have one arg minimum, we can not compare SourceParams type, because it also infer Params
  SourceParams,
  GroupIdentifier,
  AsyncProcessExceptions
>;

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
 *
 * **Insertions:**
 * - Extend functionality with custom insertions
 * - Examples: persistence, caching, retry logic
 * - Insertions receive access to resource state and params
 *
 * @template AsyncProcesstate - The type of data returned by the async operation
 * @template AsyncProcessParams - The type of params passed to the loader
 * @template AsyncProcessArgsParams - The type of arguments for the method function
 * @template SourceParams - The type emitted by the source (for source-based methods)
 * @template GroupIdentifier - The type of identifier for parallel execution
 *
 * @param AsyncProcessConfig - Configuration object:
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
 * const delay = asyncProcess({
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
 * const delay = asyncProcess({
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
 * Business exceptions with `craftException`
 * ```ts
 * import { asyncProcess, craftException } from '@craft-ng/core';
 *
 * const loadUser = asyncProcess({
 *   method: (value: string) =>
 *     value.length < 3
 *       ? craftException(
 *           { code: 'SEARCH_TERM_TOO_SHORT' },
 *           { min: 3, received: value.length },
 *         )
 *       : value,
 *   loader: async ({ params }) =>
 *     params === 'blocked'
 *       ? craftException(
 *           { code: 'USER_ACCESS_FORBIDDEN' },
 *           { id: params },
 *         )
 *       : { id: params, name: 'John Doe' },
 * });
 *
 * loadUser.method('ab');
 * console.log(loadUser.hasException()); // true
 * console.log(loadUser.exceptions().params?.SEARCH_TERM_TOO_SHORT);
 *
 * loadUser.method('blocked');
 * console.log(loadUser.exceptions().loader?.USER_ACCESS_FORBIDDEN);
 * ```
 *
 * @example
 * Async method with identifier for parallel operations
 * ```ts
 * const delayById = asyncProcess({
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
 * const shareContent = asyncProcess({
 *   method: (payload: { title: string, url: string }) => payload,
 *   loader: async ({ params }) => {
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
export function asyncProcess<
  AsyncProcesstate extends object | undefined,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Exceptions extends AsyncProcessExceptionConstraints = {
    params: ExtractCraftException<AsyncProcessParams>;
    loader: ExtractCraftException<AsyncProcesstate>;
  },
>(
  AsyncProcessConfig: AsyncProcessConfig<
    AsyncProcesstate,
    AsyncProcessParams,
    AsyncProcessArgsParams,
    SourceParams,
    GroupIdentifier
  >,
): AsyncProcessOutput<
  StripCraftException<AsyncProcesstate>,
  StripCraftException<AsyncProcessParams>,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  {},
  Exceptions
>;
export function asyncProcess<
  AsyncProcesstate extends object | undefined,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
  Exceptions extends AsyncProcessExceptionConstraints = {
    params: ExtractCraftException<AsyncProcessParams>;
    loader: ExtractCraftException<AsyncProcesstate>;
  },
>(
  AsyncProcessConfig: AsyncProcessConfig<
    AsyncProcesstate,
    AsyncProcessParams,
    AsyncProcessArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion1,
    {}
  >,
): AsyncProcessOutput<
  StripCraftException<AsyncProcesstate>,
  StripCraftException<AsyncProcessParams>,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
  Exceptions
>;
export function asyncProcess<
  AsyncProcesstate extends object | undefined,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
  Insertion2,
  Exceptions extends AsyncProcessExceptionConstraints = {
    params: ExtractCraftException<AsyncProcessParams>;
    loader: ExtractCraftException<AsyncProcesstate>;
  },
>(
  AsyncProcessConfig: AsyncProcessConfig<
    AsyncProcesstate,
    AsyncProcessParams,
    AsyncProcessArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion2,
    Insertion1
  >,
): AsyncProcessOutput<
  StripCraftException<AsyncProcesstate>,
  StripCraftException<AsyncProcessParams>,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2,
  Exceptions
>;
export function asyncProcess<
  AsyncProcesstate extends object | undefined,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
  Insertion2,
  Insertion3,
  Exceptions extends AsyncProcessExceptionConstraints = {
    params: ExtractCraftException<AsyncProcessParams>;
    loader: ExtractCraftException<AsyncProcesstate>;
  },
>(
  AsyncProcessConfig: AsyncProcessConfig<
    AsyncProcesstate,
    AsyncProcessParams,
    AsyncProcessArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion3,
    Insertion1 & Insertion2
  >,
): AsyncProcessOutput<
  StripCraftException<AsyncProcesstate>,
  StripCraftException<AsyncProcessParams>,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3,
  Exceptions
>;
export function asyncProcess<
  AsyncProcesstate extends object | undefined,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Exceptions extends AsyncProcessExceptionConstraints = {
    params: ExtractCraftException<AsyncProcessParams>;
    loader: ExtractCraftException<AsyncProcesstate>;
  },
>(
  AsyncProcessConfig: AsyncProcessConfig<
    AsyncProcesstate,
    AsyncProcessParams,
    AsyncProcessArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
): AsyncProcessOutput<
  StripCraftException<AsyncProcesstate>,
  StripCraftException<AsyncProcessParams>,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4,
  Exceptions
>;
export function asyncProcess<
  AsyncProcesstate extends object | undefined,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Exceptions extends AsyncProcessExceptionConstraints = {
    params: ExtractCraftException<AsyncProcessParams>;
    loader: ExtractCraftException<AsyncProcesstate>;
  },
>(
  AsyncProcessConfig: AsyncProcessConfig<
    AsyncProcesstate,
    AsyncProcessParams,
    AsyncProcessArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
): AsyncProcessOutput<
  StripCraftException<AsyncProcesstate>,
  StripCraftException<AsyncProcessParams>,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
  Exceptions
>;
export function asyncProcess<
  AsyncProcesstate extends object | undefined,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  Exceptions extends AsyncProcessExceptionConstraints = {
    params: ExtractCraftException<AsyncProcessParams>;
    loader: ExtractCraftException<AsyncProcesstate>;
  },
>(
  AsyncProcessConfig: AsyncProcessConfig<
    AsyncProcesstate,
    AsyncProcessParams,
    AsyncProcessArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
  insertion6: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
  >,
): AsyncProcessOutput<
  StripCraftException<AsyncProcesstate>,
  StripCraftException<AsyncProcessParams>,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6,
  Exceptions
>;
export function asyncProcess<
  AsyncProcesstate extends object | undefined,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  Insertion7,
  Exceptions extends AsyncProcessExceptionConstraints = {
    params: ExtractCraftException<AsyncProcessParams>;
    loader: ExtractCraftException<AsyncProcesstate>;
  },
>(
  AsyncProcessConfig: AsyncProcessConfig<
    AsyncProcesstate,
    AsyncProcessParams,
    AsyncProcessArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
  insertion6: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
  >,
  insertion7: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    Exceptions,
    Insertion7,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6
  >,
): AsyncProcessOutput<
  StripCraftException<AsyncProcesstate>,
  StripCraftException<AsyncProcessParams>,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 &
    Insertion2 &
    Insertion3 &
    Insertion4 &
    Insertion5 &
    Insertion6 &
    Insertion7,
  Exceptions
>;
export function asyncProcess<
  AsyncProcesstate extends object | undefined,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Exceptions extends AsyncProcessExceptionConstraints = {
    params: ExtractCraftException<AsyncProcessParams>;
    loader: ExtractCraftException<AsyncProcesstate>;
  },
>(
  AsyncProcessConfig: AsyncProcessConfig<
    AsyncProcesstate,
    AsyncProcessParams,
    AsyncProcessArgsParams,
    SourceParams,
    GroupIdentifier
  >,
  ...insertions: any[]
): AsyncProcessOutput<
  AsyncProcesstate,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  {},
  Exceptions
> {
  const AsyncProcessResourceParamsFnSignal = signal<
    AsyncProcessParams | undefined
  >(undefined);

  const hasParamsFn =
    'params' in AsyncProcessConfig &&
    typeof AsyncProcessConfig.params === 'function';
  const isConnectedToSource =
    !hasParamsFn && isSource(AsyncProcessConfig.method);
  const hasMethodFn =
    !hasParamsFn &&
    typeof AsyncProcessConfig.method === 'function' &&
    !isSignal(AsyncProcessConfig.method);

  const isUsingIdentifier = 'identifier' in AsyncProcessConfig;

  const methodParamsException = signal<AnyCraftException | undefined>(
    undefined,
  );

  const getIdentifierFromParams = (params: unknown): string | undefined => {
    if (!isUsingIdentifier || !('identifier' in AsyncProcessConfig)) {
      return undefined;
    }

    if (params === undefined || params === null) {
      return undefined;
    }

    return AsyncProcessConfig.identifier?.(params as any) as string | undefined;
  };

  const sanitizeParamsResult = (value: AsyncProcessParams | undefined) => {
    if (isCraftException(value)) {
      return undefined;
    }

    return value;
  };

  const reactiveParamsException = computed(() => {
    if (hasMethodFn) {
      return undefined;
    }

    if (hasParamsFn) {
      const paramsValue = (
        AsyncProcessConfig as { params: () => AsyncProcessParams }
      ).params();
      return isCraftException(paramsValue)
        ? enrichResourceException(paramsValue, { scope: 'params' })
        : undefined;
    }

    if (isConnectedToSource) {
      const sourceValue = (
        AsyncProcessConfig.method as unknown as Signal<
          AsyncProcessParams | undefined
        >
      )();
      return isCraftException(sourceValue)
        ? enrichResourceException(sourceValue, { scope: 'params' })
        : undefined;
    }

    return undefined;
  });

  const paramsException = computed(() => {
    return hasMethodFn ? methodParamsException() : reactiveParamsException();
  });

  const {
    setLoaderException,
    exceptions,
    hasException,
    createSelectExceptions,
    createSelectHasException,
  } = createResourceExceptionsRuntime({
    isUsingIdentifier,
    paramsException,
  });

  const wrappedSourceParams = isConnectedToSource
    ? ((() =>
        sanitizeParamsResult(
          (
            AsyncProcessConfig.method as unknown as Signal<
              AsyncProcessParams | undefined
            >
          )(),
        )) as Signal<AsyncProcessParams | undefined>)
    : undefined;

  const wrappedParamsFn = hasParamsFn
    ? ((() =>
        sanitizeParamsResult(
          (AsyncProcessConfig as { params: () => AsyncProcessParams }).params(),
        )) as () => AsyncProcessParams | undefined)
    : undefined;

  const wrappedLoader =
    'loader' in AsyncProcessConfig && AsyncProcessConfig.loader
      ? ((async (param: ResourceLoaderParams<any>) => {
          const result = await (
            AsyncProcessConfig.loader as (
              param: ResourceLoaderParams<any>,
            ) => Promise<any>
          )(param);

          if (isCraftException(result)) {
            const exceptionId = getIdentifierFromParams(param.params);
            setLoaderException(
              enrichResourceException(result, {
                scope: 'loader',
                identifier: exceptionId,
              }),
              exceptionId,
            );
            return undefined;
          }

          const successId = getIdentifierFromParams(param.params);
          setLoaderException(undefined, successId);
          return result;
        }) as typeof AsyncProcessConfig.loader)
      : undefined;

  const resourceParamsSrc = isConnectedToSource
    ? (wrappedSourceParams as typeof AsyncProcessConfig.method)
    : hasParamsFn
      ? wrappedParamsFn
      : AsyncProcessResourceParamsFnSignal;

  const resourceTarget = isUsingIdentifier
    ? resourceById<
        AsyncProcesstate,
        AsyncProcessParams,
        GroupIdentifier & string,
        string,
        unknown,
        unknown
      >({
        ...AsyncProcessConfig,
        params: resourceParamsSrc,
        loader: wrappedLoader,
        identifier: AsyncProcessConfig.identifier,
      } as any)
    : craftResource<AsyncProcesstate, AsyncProcessParams>({
        ...AsyncProcessConfig,
        params: resourceParamsSrc,
        loader: wrappedLoader,
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
            AsyncProcesstate,
            AsyncProcessParams
          >,
          select: (id: GroupIdentifier) => {
            const selectExceptions = createSelectExceptions(
              id as unknown as string,
            );
            const selectHasException = createSelectHasException(
              id as unknown as string,
            );

            return computed(() => {
              const list = (
                resourceTarget as ResourceByIdRef<
                  GroupIdentifier & string,
                  AsyncProcesstate,
                  AsyncProcessParams
                >
              )();
              //@ts-expect-error GroupIdentifier & string is not recognized correctly
              const resource = list[id];
              if (!resource) {
                return undefined;
              }

              return Object.assign(resource, {
                hasException: selectHasException,
                exceptions: selectExceptions,
              });
            })();
          },
        }
      : {},
    {
      hasException,
      exceptions,
      ...(hasParamsFn
        ? { resourceParamsSrc }
        : {
            method: isSignal(AsyncProcessConfig.method)
              ? undefined
              : (arg: AsyncProcessArgsParams) => {
                  const result = (
                    AsyncProcessConfig as {
                      method: (
                        args: AsyncProcessArgsParams,
                      ) => AsyncProcessParams;
                    }
                  ).method(arg);
                  if (isCraftException(result)) {
                    methodParamsException.set(
                      enrichResourceException(result, { scope: 'params' }),
                    );
                    return result as AsyncProcessParams;
                  }

                  if (methodParamsException()) {
                    methodParamsException.set(undefined);
                  }

                  if (isUsingIdentifier) {
                    const id = AsyncProcessConfig.identifier?.(arg as any);
                    (
                      resourceTarget as ResourceByIdRef<
                        GroupIdentifier & string,
                        AsyncProcesstate,
                        AsyncProcessParams
                      >
                    ).addById(id as GroupIdentifier & string);
                  }
                  AsyncProcessResourceParamsFnSignal.set(
                    result as AsyncProcessParams,
                  );
                  return result;
                },
          }),
    },
    (
      insertions as InsertionsResourcesFactory<
        NoInfer<GroupIdentifier>,
        NoInfer<StripCraftException<AsyncProcesstate>>,
        NoInfer<StripCraftException<AsyncProcessParams>>,
        AsyncProcessExceptionConstraints,
        {},
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
              NoInfer<AsyncProcessParams>
            >,
            hasException,
            exceptions,
            insertions: acc as {},
            state: resourceTarget.state,
            set: resourceTarget.set,
            update: resourceTarget.update,
          } as any),
        };
      },
      {} as Record<string, unknown>,
    ),
  ) as unknown as AsyncProcessOutput<
    AsyncProcesstate,
    AsyncProcessParams,
    AsyncProcessArgsParams,
    SourceParams,
    GroupIdentifier,
    {},
    Exceptions
  >;
}
