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
  BusinessExceptionScope,
  createBusinessExceptionStore,
  ExtractBusinessExceptionsFromObject,
  ExtractStateExceptions,
  getStateExceptionDefinitions,
  GroupedBusinessExceptions,
  isBusinessException,
  MethodException,
  StripBusinessExceptions,
  wrapExceptionAwareMethods,
} from './business-exception';

type FilterExceptionsByScope<
  Exceptions,
  Scope extends BusinessExceptionScope,
> = Extract<Exceptions, { scope: Scope }>;

type AsyncProcessOutputExceptions<Value, Params, Insertions> =
  GroupedBusinessExceptions<
    FilterExceptionsByScope<
      | ExtractStateExceptions<Value>
      | ExtractBusinessExceptionsFromObject<Insertions>,
      'state'
    >,
    FilterExceptionsByScope<
      | Extract<Params, MethodException>
      | ExtractBusinessExceptionsFromObject<Insertions>,
      'method'
    >,
    FilterExceptionsByScope<
      | ExtractStateExceptions<Value>
      | ExtractBusinessExceptionsFromObject<Insertions>,
      'reactionInsertion'
    >
  >;

type AsyncProcessRuntimeParams<Params> = StripBusinessExceptions<Params>;

// ! It looks like TS does not handle to expose the ResourceByIdHandler without erasing the () => ... part
export type AsyncProcessRef<
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
          readonly safeValue: Signal<Value | undefined>;
          hasValue(): boolean;
        }
      : {},
    {
      readonly exceptions?: Signal<
        AsyncProcessOutputExceptions<Value, Params, Insertions>
      >;
    },
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
      : ResourceByIdRef<
          GroupIdentifier & string,
          Value,
          AsyncProcessRuntimeParams<Params>
        > & {
          _resourceById: ResourceByIdRef<
            GroupIdentifier & string,
            Value,
            AsyncProcessRuntimeParams<Params>
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
                readonly safeValue: Signal<Value | undefined>;
                hasValue(): boolean;
              }
            | undefined;
        },
  ]
>;

type AsyncProcessConfig<
  ResourceState,
  Params,
  ParamsArgs,
  SourceParams,
  GroupIdentifier,
> = Omit<
  ResourceOptions<NoInfer<ResourceState>, AsyncProcessRuntimeParams<Params>>,
  'params' | 'loader'
> &
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
          params: NoInfer<NonNullable<AsyncProcessRuntimeParams<Params>>>,
        ) => GroupIdentifier;
        loader: (
          param: ResourceLoaderParams<
            NonNullable<
              [unknown] extends [Params]
                ? NoInfer<SourceParams>
                : NoInfer<AsyncProcessRuntimeParams<Params>>
            >
          >,
        ) => Promise<ResourceState>;
        stream?: never;
        preservePreviousValue?: () => boolean;
      }
    | {
        method: ((args: ParamsArgs) => Params) | ReadonlySource<SourceParams>;
        loader?: never;
        identifier?: (
          params: NoInfer<NonNullable<AsyncProcessRuntimeParams<Params>>>,
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
                ? NoInfer<SourceParams>
                : NoInfer<AsyncProcessRuntimeParams<Params>>
            >
          >
        >;
        preservePreviousValue?: () => boolean;
      }
  );

export type AsyncProcessOutput<
  State extends object | undefined,
  Params,
  ArgParams,
  SourceParams,
  GroupIdentifier,
  Insertions,
> = AsyncProcessRef<
  State,
  ArgParams,
  Params,
  Insertions,
  [unknown] extends [ArgParams] ? false : true, // ! force to method to have one arg minimum, we can not compare SourceParams type, because it also infer Params
  SourceParams,
  GroupIdentifier
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
>(
  AsyncProcessConfig: AsyncProcessConfig<
    AsyncProcesstate,
    AsyncProcessParams,
    AsyncProcessArgsParams,
    SourceParams,
    GroupIdentifier
  >,
): AsyncProcessOutput<
  AsyncProcesstate,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  {}
>;
export function asyncProcess<
  AsyncProcesstate extends object | undefined,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
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
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion1
  >,
): AsyncProcessOutput<
  AsyncProcesstate,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1
>;
export function asyncProcess<
  AsyncProcesstate extends object | undefined,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
  Insertion2,
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
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion2,
    Insertion1
  >,
): AsyncProcessOutput<
  AsyncProcesstate,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2
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
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion3,
    Insertion1 & Insertion2
  >,
): AsyncProcessOutput<
  AsyncProcesstate,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3
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
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
): AsyncProcessOutput<
  AsyncProcesstate,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4
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
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
): AsyncProcessOutput<
  AsyncProcesstate,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
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
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
  insertion6: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
  >,
): AsyncProcessOutput<
  AsyncProcesstate,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6
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
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
  insertion6: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
  >,
  insertion7: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<AsyncProcesstate>,
    NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
    Insertion7,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6
  >,
): AsyncProcessOutput<
  AsyncProcesstate,
  AsyncProcessParams,
  AsyncProcessArgsParams,
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
export function asyncProcess<
  AsyncProcesstate extends object | undefined,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
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
  {}
> {
  const AsyncProcessResourceParamsFnSignal = signal<
    AsyncProcessRuntimeParams<AsyncProcessParams> | undefined
  >(undefined);

  const isConnectedToSource = isSource(AsyncProcessConfig.method);

  const isUsingIdentifier = 'identifier' in AsyncProcessConfig;
  const exceptionStore = createBusinessExceptionStore({
    state: getStateExceptionDefinitions(
      (AsyncProcessConfig as { defaultValue?: unknown }).defaultValue,
    ),
  });

  const resourceParamsSrc = isConnectedToSource
    ? AsyncProcessConfig.method
    : AsyncProcessResourceParamsFnSignal;

  const resourceTarget = isUsingIdentifier
    ? resourceById<
        AsyncProcesstate,
        AsyncProcessRuntimeParams<AsyncProcessParams>,
        GroupIdentifier & string,
        string,
        unknown,
        unknown
      >({
        ...AsyncProcessConfig,
        params: resourceParamsSrc,
        identifier: AsyncProcessConfig.identifier,
      } as any)
    : craftResource<
        AsyncProcesstate,
        AsyncProcessRuntimeParams<AsyncProcessParams>
      >({
        ...AsyncProcessConfig,
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
            AsyncProcesstate,
            AsyncProcessRuntimeParams<AsyncProcessParams>
          >,
          select: (id: GroupIdentifier) => {
            return computed(() => {
              const list = (
                resourceTarget as ResourceByIdRef<
                  GroupIdentifier & string,
                  AsyncProcesstate,
                  AsyncProcessRuntimeParams<AsyncProcessParams>
                >
              )();
              //@ts-expect-error GroupIdentifier & string is not recognized correctly
              return list[id];
            })();
          },
        }
      : {},
    {
      exceptions: exceptionStore.exceptions,
      method: isSignal(AsyncProcessConfig.method)
        ? undefined
        : (arg: AsyncProcessArgsParams) => {
            const result = AsyncProcessConfig.method(arg);
            if (isBusinessException(result)) {
              exceptionStore.raiseException(result);
              return result;
            }
            if (isUsingIdentifier) {
              const nextParams =
                result as AsyncProcessRuntimeParams<AsyncProcessParams>;
              if (nextParams != null) {
                const id = AsyncProcessConfig.identifier?.(
                  nextParams as NonNullable<
                    AsyncProcessRuntimeParams<AsyncProcessParams>
                  >,
                );
                (
                  resourceTarget as ResourceByIdRef<
                    GroupIdentifier & string,
                    AsyncProcesstate,
                    AsyncProcessRuntimeParams<AsyncProcessParams>
                  >
                ).addById(id as GroupIdentifier & string);
              }
            }
            AsyncProcessResourceParamsFnSignal.set(
              result as AsyncProcessRuntimeParams<AsyncProcessParams>,
            );
            return result;
          },
    },
    (
      insertions as InsertionsResourcesFactory<
        NoInfer<GroupIdentifier>,
        NoInfer<AsyncProcesstate>,
        NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>,
        {}
      >[]
    )?.reduce(
      (acc, insert) => {
        const newInsertions = wrapExceptionAwareMethods(
          insert({
            ...(isUsingIdentifier
              ? { resourceById: resourceTarget }
              : { resource: resourceTarget }),
            resourceParamsSrc: resourceParamsSrc as WritableSignal<
              NoInfer<AsyncProcessRuntimeParams<AsyncProcessParams>>
            >,
            insertions: acc as {},
            state: resourceTarget.state,
            set: resourceTarget.set,
            update: resourceTarget.update,
            exceptions: exceptionStore.exceptions,
            raiseException: exceptionStore.raiseException,
            clearException: exceptionStore.clearException,
            clearExceptionScope: exceptionStore.clearScope,
            clearExceptions: exceptionStore.clearAll,
          } as any) as Record<string, unknown>,
          exceptionStore.raiseException,
        );
        return {
          ...acc,
          ...newInsertions,
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
    {}
  >;
}
