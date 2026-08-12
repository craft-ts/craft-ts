import {
  assertInInjectionContext,
  computed,
  DestroyRef,
  inject,
  Injector,
  isSignal,
  Provider,
  ResourceLoaderParams,
  ResourceOptions,
  ResourceStreamingLoader,
  runInInjectionContext,
  Signal,
  signal,
  untracked,
  WritableSignal,
} from '@angular/core';
import { InsertionsResourcesFactory } from './query.core';
import {
  executeGeneratorCompatibleFactory,
  GeneratorCompatibleFactory,
  isGenerator,
  isGeneratorFunction,
  runCraftGenerator,
} from './craft-generator-runtime';
import { executeGeneratorCompatibleFactoryAsync } from './craft-program-runtime';
import {
  attachCraftSettledValue,
  type CraftSettledSignal,
} from './craft-settled';
import type { ExtractCraftGenExceptions } from './craft-gen';
import { ReadonlySource } from './util/source.type';
import {
  CraftResourceStatus,
  toCraftStatus,
} from './util/craft-resource-status';
import { resourceById, ResourceByIdRef } from './resource-by-id';
import { isSource } from './util/util';
import {
  methodParamsWrapperEqual,
  unwrapMethodParams,
  wrapMethodParams,
} from './util/method-trigger-nonce';
import { MergeObjects } from './util/util.type';
import { craftResource } from './craft-resource';
import { preservedResource } from './preserved-resource';
import { CraftResourceRef } from './util/craft-resource-ref';
import {
  AnyCraftException,
  ExtractCraftException,
  InsertMetaInCraftExceptionIfExists,
  StripCraftException,
  isCraftException,
} from './craft-exception';
import { CORRELATION_ID_SERVICE } from './correlation-id';
import {
  createNamedPrimitiveGen,
  type CraftPrimitiveGen,
  type NamedCraftPrimitiveGen,
} from './craft-primitive-gen';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  createSchemaValidationRuntime,
  type CraftSchema,
  type SchemaValidationPolicy,
  type SchemaParseExceptions,
  type SchemaInput,
  type SchemaOutput,
  useSchemaValidationPolicy,
} from './schema-validation';
import {
  APP_SNAPSHOT_REGISTRY,
  INSERTION_SNAPSHOT_REGISTRY,
  InsertionSnapshotRegistry,
  TAKE_APP_SNAPSHOT,
  triggerAndCollectInsertions,
} from './take-app-snapshot';
import {
  createResourceExceptionsRuntime,
  enrichResourceException,
} from './resource-exception';
import type {
  BrandedServiceProvider,
  SERVICE_HELPER_DEPENDENCIES,
  ServiceDependencyMapFromYieldedAndValues,
} from './craft-service';
import { ɵcreateHostTaggedInjector, ɵHOST_TAG_LIST } from './craft-service';
import { injectFnWrapper } from './fn-wrapper';
import { ɵprovidePrimitiveMethodRuntimeContext } from './primitive-method-runtime-context';
import {
  ɵcreatePrimitiveResourceByIdRuntimeContext,
  ɵcreatePrimitiveResourceRuntimeContext,
  ɵobservePrimitiveResourceRuntimeContext,
} from './primitive-resource-runtime-context';
import {
  createYieldableInsertionMethod,
  isNonYieldableInsertionMethod,
  yieldableInvocation,
} from './yieldable';
import type { YieldableInvocation } from './yieldable';
import type {
  BrandReactiveProperties,
  YieldableInsertionMethods,
} from './yieldable';

type AsyncProcessConfigProviderNames<Providers> =
  Providers extends readonly (infer P)[]
    ? P extends BrandedServiceProvider<infer Name, any, any>
      ? Name
      : never
    : never;

type SatisfyDependencies<Deps, SatisfiedNames extends string> = {
  [K in keyof Deps as K extends SatisfiedNames ? never : K]: Deps[K];
};

type AsyncProcessTrackedDependencies<
  ParamsYielded = never,
  MethodYielded = never,
  LoaderYielded = never,
  StreamYielded = never,
  InsertionsYielded = never,
  Providers = never,
  Insertions = never,
> = [AsyncProcessConfigProviderNames<Providers>] extends [never]
  ? ServiceDependencyMapFromYieldedAndValues<
      | ParamsYielded
      | MethodYielded
      | LoaderYielded
      | StreamYielded
      | InsertionsYielded,
      Insertions
    >
  : SatisfyDependencies<
      ServiceDependencyMapFromYieldedAndValues<
        | ParamsYielded
        | MethodYielded
        | LoaderYielded
        | StreamYielded
        | InsertionsYielded,
        Insertions
      >,
      AsyncProcessConfigProviderNames<Providers>
    >;

type AsyncProcessDependenciesMetadata<Dependencies> = [
  keyof Dependencies,
] extends [never]
  ? {}
  : {
      readonly [SERVICE_HELPER_DEPENDENCIES]?: Dependencies;
    };

const ASYNC_PROCESS_INVALID_YIELD_ERROR_MESSAGE =
  'asyncProcess generators can only yield craftService dependencies or exposed dependency helpers.';
const ASYNC_PROCESS_APP_START_ERROR_MESSAGE =
  'asyncProcess generators do not support onAppStart(...).';

// ! It looks like TS does not handle to expose the ResourceByIdHandler without erasing the () => ... part
/** The `craftException`s a resource-like async process may surface. */
export type ResourceLikeAsyncProcessExceptionUnion<
  AsyncProcessException extends AsyncProcessExceptionConstraints,
> =
  ResourceLikeAsyncProcessExceptions<AsyncProcessException> extends {
    exception: Signal<infer Exception>;
  }
    ? Exclude<Exception, undefined>
    : never;

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
  Dependencies = {},
  HasSchema extends boolean = false,
  MethodYielded = never,
  Name extends string = string,
> = MergeObjects<
  [
    HasSchema extends true ? { readonly hasSchema: Signal<true> } : {},
    [unknown] extends [GroupIdentifier]
      ? {
          readonly value: Signal<Value | undefined>;
          readonly status: Signal<CraftResourceStatus>;
          readonly isLoading: Signal<boolean>;
          hasValue(): boolean;
          /**
           * The settled read: never `undefined`, never a value while an
           * exception is carried — it suspends instead, to the nearest
           * `pendingBlock`.
           */
          readonly settledValue: CraftSettledSignal<
            Exclude<Value, undefined>,
            Name,
            ResourceLikeAsyncProcessExceptionUnion<AsyncProcessExceptions>
          >;
        } & ResourceLikeAsyncProcessExceptions<AsyncProcessExceptions>
      : {},
    YieldableInsertionMethods<Insertions>,
    IsMethod extends true
      ? {
          method: (
            args: ArgParams,
          ) => YieldableInvocation<MethodYielded, Params>;
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
                readonly status: Signal<CraftResourceStatus>;
                readonly isLoading: Signal<boolean>;
                hasValue(): boolean;
              } & ResourceLikeAsyncProcessExceptions<
                AsyncProcessExceptions,
                GroupIdentifier
              >)
            | undefined;
          selectOrCreate: (id: GroupIdentifier) => {
            readonly value: Signal<Value | undefined>;
            readonly status: Signal<CraftResourceStatus>;
            readonly isLoading: Signal<boolean>;
            hasValue(): boolean;
          } & ResourceLikeAsyncProcessExceptions<
            AsyncProcessExceptions,
            GroupIdentifier
          >;
        } & ([GroupIdentifier] extends [string]
            ? ResourceByIdLikeAsyncProcessExceptions<
                AsyncProcessExceptions,
                GroupIdentifier
              >
            : {}),
    AsyncProcessDependenciesMetadata<Dependencies>,
  ]
>;

type AsyncProcessConfig<
  ResourceState,
  Params,
  ParamsArgs,
  SourceParams,
  GroupIdentifier,
  ParamsYielded = never,
  MethodYielded = never,
  LoaderYielded = never,
  StreamYielded = never,
> = Omit<ResourceOptions<NoInfer<ResourceState>, Params>, 'params' | 'loader'> &
  (
    | {
        /**
         * Used to generate a method in the store, when called will trigger the resource loader/stream.
         *
         * Only support one parameter which can be an object to pass multiple parameters.
         */
        method:
          | GeneratorCompatibleFactory<
              (args: ParamsArgs) => Params,
              MethodYielded
            >
          | ReadonlySource<SourceParams>;
        /**
         * A unique identifier for the resource, derived from the params.
         * It should be a string that uniquely identifies the resource based on the params.
         */
        identifier?: (
          params: NoInfer<NonNullable<StripCraftException<Params>>>,
        ) => GroupIdentifier;
        loader: GeneratorCompatibleFactory<
          (
            param: ResourceLoaderParams<
              NonNullable<
                [unknown] extends [Params]
                  ? NoInfer<StripCraftException<SourceParams>>
                  : NoInfer<StripCraftException<Params>>
              >
            >,
          ) => Promise<ResourceState>,
          LoaderYielded
        >;
        params?: never;
        stream?: never;
        preservePreviousValue?: () => boolean;
      }
    | {
        method:
          | GeneratorCompatibleFactory<
              (args: ParamsArgs) => Params,
              MethodYielded
            >
          | ReadonlySource<SourceParams>;
        loader?: never;
        identifier?: (
          params: NoInfer<NonNullable<StripCraftException<Params>>>,
        ) => GroupIdentifier;
        /**
         * Loading function which returns a `Promise` of a signal of the resource's value for a given
         * request, which can change over time as new values are received from a stream.
         */
        stream: GeneratorCompatibleFactory<
          ResourceStreamingLoader<
            ResourceState,
            ResourceLoaderParams<
              NonNullable<
                [unknown] extends [Params]
                  ? NoInfer<StripCraftException<SourceParams>>
                  : NoInfer<StripCraftException<Params>>
              >
            >
          >,
          StreamYielded
        >;
        params?: never;
        preservePreviousValue?: () => boolean;
      }
    | {
        /**
         * A reactive function which determines the request to be made. Whenever the request changes, the
         * loader will be triggered to fetch a new value for the resource.
         */
        params: GeneratorCompatibleFactory<() => Params, ParamsYielded>;
        /**
         * A unique identifier for the resource, derived from the params.
         * It should be a string that uniquely identifies the resource based on the params.
         */
        identifier?: (
          params: NoInfer<NonNullable<StripCraftException<Params>>>,
        ) => GroupIdentifier;
        loader: GeneratorCompatibleFactory<
          (
            param: ResourceLoaderParams<
              NonNullable<NoInfer<StripCraftException<Params>>>
            >,
          ) => Promise<ResourceState>,
          LoaderYielded
        >;
        method?: never;
        stream?: never;
        preservePreviousValue?: () => boolean;
      }
  ) & {
    methodSchema?: CraftSchema;
    paramsSchema?: CraftSchema;
    loaderSchema?: CraftSchema;
    schemaValidationPolicy?: SchemaValidationPolicy;
  };

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
  exception: Signal<
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
    | undefined
  >;
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
  }> &
    (AsyncProcessException extends { parse: infer Parse }
      ? { parse: Parse }
      : {});
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
  }> &
    (AsyncProcessException extends { parse: infer Parse }
      ? { parse: Parse }
      : {});
};

export type AsyncProcessOutput<
  State extends object | undefined,
  Params,
  ArgParams,
  SourceParams,
  GroupIdentifier,
  Insertions,
  AsyncProcessExceptions extends AsyncProcessExceptionConstraints,
  Dependencies = {},
  HasSchema extends boolean = false,
  MethodYielded = never,
  Name extends string = string,
> = AsyncProcessRef<
  StripCraftException<State>,
  ArgParams,
  StripCraftException<Params>,
  BrandReactiveProperties<Insertions>,
  [unknown] extends [ArgParams]
    ? [unknown] extends [SourceParams]
      ? 'params'
      : false
    : true, // ! force to method to have one arg minimum, we can not compare SourceParams type, because it also infer Params
  SourceParams,
  GroupIdentifier,
  AsyncProcessExceptions,
  Dependencies,
  HasSchema,
  MethodYielded,
  Name
>;

type SchemaAsyncProcessConfig<
  MethodSchema extends CraftSchema,
  ParamsSchema extends CraftSchema,
  LoaderSchema extends CraftSchema,
> = {
  methodSchema: MethodSchema;
  paramsSchema: ParamsSchema;
  loaderSchema: LoaderSchema;
  method: (args: SchemaOutput<MethodSchema>) => SchemaInput<ParamsSchema>;
  loader: (
    param: ResourceLoaderParams<SchemaOutput<ParamsSchema>>,
  ) => Promise<SchemaInput<LoaderSchema>> | SchemaInput<LoaderSchema>;
  [key: string]: unknown;
};

export function asyncProcess<
  Name extends string,
  MethodSchema extends CraftSchema,
  ParamsSchema extends CraftSchema,
  LoaderSchema extends CraftSchema,
>(
  name: Name,
  config: SchemaAsyncProcessConfig<MethodSchema, ParamsSchema, LoaderSchema>,
): NamedCraftPrimitiveGen<
  Name,
  AsyncProcessOutput<
    SchemaOutput<LoaderSchema>,
    SchemaOutput<ParamsSchema>,
    SchemaInput<MethodSchema>,
    SchemaOutput<ParamsSchema>,
    unknown,
    {},
    AsyncProcessExceptionConstraints & { parse: SchemaParseExceptions },
    {},
    true,
    never,
    Name
  >
>;

export function asyncProcess<
  Name extends string,
  MethodSchema extends CraftSchema,
  Params,
  State extends object | undefined,
>(
  name: Name,
  config: {
    methodSchema: MethodSchema;
    method: (args: SchemaOutput<MethodSchema>) => Params;
    loader: (param: ResourceLoaderParams<Params>) => Promise<State> | State;
    [key: string]: unknown;
  },
): NamedCraftPrimitiveGen<
  Name,
  AsyncProcessOutput<
    State,
    Params,
    SchemaInput<MethodSchema>,
    Params,
    unknown,
    {},
    AsyncProcessExceptionConstraints & { parse: SchemaParseExceptions },
    {},
    true,
    never,
    Name
  >
>;

export function asyncProcess<
  Name extends string,
  ParamsSchema extends CraftSchema,
  ParamsState extends object | undefined,
>(
  name: Name,
  config: {
    paramsSchema: ParamsSchema;
    params: () => SchemaInput<ParamsSchema>;
    loader: (
      param: ResourceLoaderParams<SchemaOutput<ParamsSchema>>,
    ) => Promise<ParamsState> | ParamsState;
    [key: string]: unknown;
  },
): NamedCraftPrimitiveGen<
  Name,
  AsyncProcessOutput<
    ParamsState,
    SchemaOutput<ParamsSchema>,
    unknown,
    SchemaOutput<ParamsSchema>,
    unknown,
    {},
    AsyncProcessExceptionConstraints & { parse: SchemaParseExceptions },
    {},
    true,
    never,
    Name
  >
>;

export function asyncProcess<
  Name extends string,
  LoaderSchema extends CraftSchema,
  LoaderParams,
>(
  name: Name,
  config: {
    loaderSchema: LoaderSchema;
    params: () => LoaderParams;
    loader: (
      param: ResourceLoaderParams<LoaderParams>,
    ) => Promise<SchemaInput<LoaderSchema>> | SchemaInput<LoaderSchema>;
    [key: string]: unknown;
  },
): NamedCraftPrimitiveGen<
  Name,
  AsyncProcessOutput<
    SchemaOutput<LoaderSchema>,
    LoaderParams,
    unknown,
    LoaderParams,
    unknown,
    {},
    AsyncProcessExceptionConstraints & { parse: SchemaParseExceptions },
    {},
    true,
    never,
    Name
  >
>;

/**
 * Creates an async method that manages asynchronous operations with automatic state tracking.
 *
 * This function creates a reactive async operation by:
 * - Managing loading, resolved, exception, and idle states automatically
 * - Supporting both method-based (manual) and source-based (automatic) triggering
 * - Enabling parallel execution with identifiers
 * - Providing signals for value, status, exceptions, and loading state
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
 * - `exception`: A `craftException` was returned by the method/loader (technical
 *   errors are left to throw and are not part of the craft status)
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
 * @param name - The async process name. Used to key the returned record
 *   (`const loadUser = yield* asyncProcess('loadUser', config)`) and as the
 *   injector host tag (`asyncProcess:loadUser`), so the primitive is precisely
 *   locatable in snapshots and logs.
 * @param AsyncProcessConfig - Configuration object:
 *   - `method`: Function returning params OR source for automatic triggering
 *   - `loader`: Async function that performs the operation (mutually exclusive with `stream`)
 *   - `stream`: Streaming loader for progressive updates (mutually exclusive with `loader`)
 *   - `identifier`: Optional function to derive unique ID for parallel execution
 *   - `preservePreviousValue`: Optional function returning whether to keep the previous value while loading (default: false)
 *
 * @returns A single-use primitive generator resolving to an async method
 *   reference with:
 *   - `value`: Signal containing the result (or undefined)
 *   - `status`: Signal with the craft state ('idle' | 'loading' | 'reloading' | 'resolved' | 'local' | 'exception')
 *   - `exception`: Signal with the primary `craftException` (or undefined)
 *   - `exceptions`: Signal with the captured exceptions (`list` / `params` / `loader`)
 *   - `hasException()`: Signal indicating whether an exception is captured
 *   - `isLoading`: Signal for loading state
 *   - `hasValue()`: Function to check if value exists
 *   - `method`: (method-based only) Function to trigger the operation
 *   - `source`: (source-based only) Readonly source for automatic triggering
 *   - `select(id)`: (with identifier) Access individual instance by ID
 *   - `selectOrCreate(id)`: (with identifier) Access or create an individual instance
 *
 *   Consume it with `yield*` inside a generator host (craftService factory,
 *   craftGen, …) or with `craftUse(...)` elsewhere (typically a component field).
 *
 * @example
 * Basic method-based async method
 * ```ts
 * const delay = craftUse(asyncProcess('delay', {
 *   method: (delay: number) => delay,
 *   loader: async ({ params }) => {
 *     await new Promise(resolve => setTimeout(resolve, 500)); // Simulate delay
 *     return 'done';
 *   },
 * }));
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
 * const delay = craftUse(asyncProcess('delay', {
 *   method: afterRecomputation(delaySource, (term) => term),
 *   loader: async ({ params }) => {
 *     // Debounce at source level
 *     await new Promise(resolve => setTimeout(resolve, 300));
 *     return 'done';
 *   },
 * }));
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
 * const loadUser = craftUse(asyncProcess('loadUser', {
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
 * }));
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
 * const delayById = craftUse(asyncProcess('delayById', {
 *   method: (id: string) => id,
 *   identifier: (id) => id,
 *   loader: async () => {
 *     await new Promise(resolve => setTimeout(resolve, 300));
 *     return 'done'; // Simulate delay
 *   },
 * }));
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
 * const shareContent = craftUse(asyncProcess('shareContent', {
 *   method: (payload: { title: string, url: string }) => payload,
 *   loader: async ({ params }) => {
 *      return navigator.share(params);
 *   },
 * }, ({resource}) => ({isMenuOpen: computed(() => resource.status() === 'loading')} )));
 *
 * // Trigger shareContent
 * shareContent.method({ title: 'Hello AI!', url: 'https://example.com' });
 * shareContent.isMenuOpen(); // true while loading
 *
 * ```
 */
export function asyncProcess<
  Name extends string,
  AsyncProcesstate extends object | undefined,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  ParamsYielded = never,
  MethodYielded = never,
  LoaderYielded = never,
  StreamYielded = never,
  Config = {},
  Providers extends readonly Provider[] = Config extends {
    readonly providers: infer P extends readonly Provider[];
  }
    ? P
    : never[],
  Exceptions extends AsyncProcessExceptionConstraints = {
    params: ExtractCraftException<AsyncProcessParams>;
    loader:
      | ExtractCraftException<AsyncProcesstate>
      | Extract<ExtractCraftGenExceptions<LoaderYielded>, AnyCraftException>;
  },
>(
  name: Name,
  AsyncProcessConfig: AsyncProcessConfig<
    AsyncProcesstate,
    AsyncProcessParams,
    AsyncProcessArgsParams,
    SourceParams,
    GroupIdentifier,
    ParamsYielded,
    MethodYielded,
    LoaderYielded,
    StreamYielded
  > &
    Config,
): NamedCraftPrimitiveGen<
  Name,
  AsyncProcessOutput<
    StripCraftException<AsyncProcesstate>,
    StripCraftException<AsyncProcessParams>,
    AsyncProcessArgsParams,
    SourceParams,
    GroupIdentifier,
    {},
    Exceptions,
    AsyncProcessTrackedDependencies<
      ParamsYielded,
      MethodYielded,
      LoaderYielded,
      StreamYielded,
      never,
      Providers
    >,
    false,
    MethodYielded,
    Name
  >
>;
export function asyncProcess<
  Name extends string,
  AsyncProcesstate extends object | undefined,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1,
  ParamsYielded = never,
  MethodYielded = never,
  LoaderYielded = never,
  StreamYielded = never,
  Insertion1Yielded = never,
  Config = {},
  Providers extends readonly Provider[] = Config extends {
    readonly providers: infer P extends readonly Provider[];
  }
    ? P
    : never[],
  Exceptions extends AsyncProcessExceptionConstraints = {
    params: ExtractCraftException<AsyncProcessParams>;
    loader:
      | ExtractCraftException<AsyncProcesstate>
      | Extract<ExtractCraftGenExceptions<LoaderYielded>, AnyCraftException>;
  },
>(
  name: Name,
  AsyncProcessConfig: AsyncProcessConfig<
    AsyncProcesstate,
    AsyncProcessParams,
    AsyncProcessArgsParams,
    SourceParams,
    GroupIdentifier,
    ParamsYielded,
    MethodYielded,
    LoaderYielded,
    StreamYielded
  > &
    Config,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<AsyncProcesstate>>,
    NoInfer<StripCraftException<AsyncProcessParams>>,
    NoInfer<Exceptions>,
    Insertion1,
    {},
    Insertion1Yielded
  >,
): NamedCraftPrimitiveGen<
  Name,
  AsyncProcessOutput<
    StripCraftException<AsyncProcesstate>,
    StripCraftException<AsyncProcessParams>,
    AsyncProcessArgsParams,
    SourceParams,
    GroupIdentifier,
    Insertion1,
    Exceptions,
    AsyncProcessTrackedDependencies<
      ParamsYielded,
      MethodYielded,
      LoaderYielded,
      StreamYielded,
      Insertion1Yielded,
      Providers,
      Insertion1
    >,
    false,
    MethodYielded,
    Name
  >
>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function asyncProcess(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AsyncProcessConfig: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...insertions: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  return createNamedPrimitiveGen(
    name,
    createAsyncProcessRef(name, AsyncProcessConfig, ...insertions),
  );
}

function createAsyncProcessRef<
  AsyncProcesstate extends object | undefined,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  ParamsYielded = never,
  MethodYielded = never,
  LoaderYielded = never,
  StreamYielded = never,
  Config = {},
  Providers extends readonly Provider[] = Config extends {
    readonly providers: infer P extends readonly Provider[];
  }
    ? P
    : never[],
  Exceptions extends AsyncProcessExceptionConstraints = {
    params: ExtractCraftException<AsyncProcessParams>;
    loader:
      | ExtractCraftException<AsyncProcesstate>
      | Extract<ExtractCraftGenExceptions<LoaderYielded>, AnyCraftException>;
  },
>(
  name: string,
  AsyncProcessConfig: AsyncProcessConfig<
    AsyncProcesstate,
    AsyncProcessParams,
    AsyncProcessArgsParams,
    SourceParams,
    GroupIdentifier,
    ParamsYielded,
    MethodYielded,
    LoaderYielded,
    StreamYielded
  > & { providers?: readonly Provider[] },
  ...insertions: any[]
): AsyncProcessOutput<
  AsyncProcesstate,
  AsyncProcessParams,
  AsyncProcessArgsParams,
  SourceParams,
  GroupIdentifier,
  {},
  Exceptions,
  {},
  false,
  MethodYielded
> {
  const insertionSnapshotRegistry = new InsertionSnapshotRegistry();
  const asyncExtraProviders = [
    {
      provide: INSERTION_SNAPSHOT_REGISTRY,
      useValue: insertionSnapshotRegistry,
    },
    ...(AsyncProcessConfig.providers ?? []),
  ];
  let injector: Injector | undefined;
  if (
    [
      'params' in AsyncProcessConfig ? AsyncProcessConfig.params : undefined,
      'method' in AsyncProcessConfig ? AsyncProcessConfig.method : undefined,
      'loader' in AsyncProcessConfig ? AsyncProcessConfig.loader : undefined,
      'stream' in AsyncProcessConfig ? AsyncProcessConfig.stream : undefined,
      ...insertions,
    ].some((value) => isGeneratorFunction(value))
  ) {
    assertInInjectionContext(asyncProcess);
    injector = ɵcreateHostTaggedInjector(
      inject(Injector),
      `asyncProcess:${name}`,
      asyncExtraProviders,
    );
  }

  const getInjector = () => {
    if (!injector) {
      assertInInjectionContext(asyncProcess);
      injector = ɵcreateHostTaggedInjector(
        inject(Injector),
        `asyncProcess:${name}`,
        asyncExtraProviders,
      );
    }

    return injector;
  };

  const AsyncProcessResourceParamsFnSignal = signal<
    AsyncProcessParams | undefined
  >(undefined);

  // Incremented on every explicit method call so the resource request always
  // changes, forcing the loader to re-run even when the method returns the same
  // value or `undefined`. Starts at 0 = "never called" to preserve idle.
  const methodTriggerSeq = signal(0);

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
  const schemaParseExceptions = signal<Record<string, AnyCraftException>>({});
  const configuredSchemas = {
    method: AsyncProcessConfig.methodSchema as CraftSchema | undefined,
    params: AsyncProcessConfig.paramsSchema as CraftSchema | undefined,
    loader: AsyncProcessConfig.loaderSchema as CraftSchema | undefined,
  };
  const hasConfiguredSchema = Object.values(configuredSchemas).some(Boolean);
  const setSchemaException = (
    stage: string,
    exception: AnyCraftException | undefined,
  ) => {
    untracked(() => {
      schemaParseExceptions.update((current) => {
        const next = { ...current };
        if (exception) next[stage] = exception;
        else delete next[stage];
        return next;
      });
    });
  };
  const schemaPolicy = useSchemaValidationPolicy(
    getInjector(),
    AsyncProcessConfig.schemaValidationPolicy as
      | SchemaValidationPolicy
      | undefined,
  );
  const schemaValidation = {
    method: createSchemaValidationRuntime({
      schema: configuredSchemas.method,
      primitive: 'asyncProcess',
      name,
      policy: schemaPolicy,
      setException: setSchemaException,
    }),
    params: createSchemaValidationRuntime({
      schema: configuredSchemas.params,
      primitive: 'asyncProcess',
      name,
      policy: schemaPolicy,
      setException: setSchemaException,
    }),
    loader: createSchemaValidationRuntime({
      schema: configuredSchemas.loader,
      primitive: 'asyncProcess',
      name,
      policy: schemaPolicy,
      setException: setSchemaException,
    }),
  };
  const schemaParse = computed(() => {
    const values = schemaParseExceptions();
    return {
      ...(values['method'] ? { method: values['method'] } : {}),
      ...(values['params'] ? { params: values['params'] } : {}),
      ...(values['loader'] ? { loader: values['loader'] } : {}),
    };
  });

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
    const schemaParamsException = schemaParseExceptions()['params'];
    if (schemaParamsException) {
      return enrichResourceException(schemaParamsException, {
        scope: 'params',
      });
    }

    if (hasParamsFn) {
      const paramsValue = executeGeneratorCompatibleFactory({
        factory: (AsyncProcessConfig as { params: () => AsyncProcessParams })
          .params,
        thisArg: undefined,
        getInjector,
        args: [],
        invalidYieldErrorMessage: ASYNC_PROCESS_INVALID_YIELD_ERROR_MESSAGE,
        multipleAppStartErrorMessage: ASYNC_PROCESS_APP_START_ERROR_MESSAGE,
        onAppStartNotSupportedErrorMessage:
          ASYNC_PROCESS_APP_START_ERROR_MESSAGE,
      });
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
    ? ((() => {
        const value = sanitizeParamsResult(
          (
            AsyncProcessConfig.method as unknown as Signal<
              AsyncProcessParams | undefined
            >
          )(),
        );
        if (!configuredSchemas.params || isCraftException(value)) return value;
        const parsed = schemaValidation.params.parseSync<AsyncProcessParams>(
          value,
          'params',
          'source',
        );
        return parsed.accepted ? parsed.value : undefined;
      }) as Signal<AsyncProcessParams | undefined>)
    : undefined;

  const wrappedParamsFn = hasParamsFn
    ? ((() => {
        const value = executeGeneratorCompatibleFactory({
          factory: (
            AsyncProcessConfig as {
              params: () => AsyncProcessParams;
            }
          ).params,
          thisArg: undefined,
          getInjector,
          args: [],
          invalidYieldErrorMessage: ASYNC_PROCESS_INVALID_YIELD_ERROR_MESSAGE,
          multipleAppStartErrorMessage: ASYNC_PROCESS_APP_START_ERROR_MESSAGE,
          onAppStartNotSupportedErrorMessage:
            ASYNC_PROCESS_APP_START_ERROR_MESSAGE,
        }) as AsyncProcessParams;
        if (!configuredSchemas.params || isCraftException(value)) {
          return sanitizeParamsResult(value);
        }
        const parsed = schemaValidation.params.parseSync<AsyncProcessParams>(
          value,
          'params',
          'params',
        );
        return parsed.accepted ? parsed.value : undefined;
      }) as () => AsyncProcessParams | undefined)
    : undefined;

  const wrappedLoader =
    'loader' in AsyncProcessConfig && AsyncProcessConfig.loader
      ? ((async (param: ResourceLoaderParams<any>) => {
          const injector = getInjector();
          const correlationSvc = injector.get(CORRELATION_ID_SERVICE, null);
          const operationId = correlationSvc?.lastCorrelationId() ?? null;
          if (operationId) correlationSvc?.startOperation(operationId);

          // Unwrap the method-trigger nonce so the user loader and identifier logic
          // only ever see plain params (no-op for source / params-fn / byId modes).
          const rawParams = unwrapMethodParams(param.params);
          const loaderParam = { ...param, params: rawParams };

          try {
            const step = await executeGeneratorCompatibleFactoryAsync({
              factory: AsyncProcessConfig.loader as (
                param: ResourceLoaderParams<any>,
              ) => Promise<any>,
              thisArg: undefined,
              getInjector,
              args: [loaderParam],
              invalidYieldErrorMessage:
                ASYNC_PROCESS_INVALID_YIELD_ERROR_MESSAGE,
              appStartNotSupportedErrorMessage:
                ASYNC_PROCESS_APP_START_ERROR_MESSAGE,
            });

            if (step.kind === 'shortCircuit') {
              const exceptionId = getIdentifierFromParams(rawParams);
              setLoaderException(
                enrichResourceException(step.exception, {
                  scope: 'loader',
                  identifier: exceptionId,
                }),
                exceptionId,
              );
              return undefined;
            }

            const result = step.value;

            if (isCraftException(result)) {
              const exceptionId = getIdentifierFromParams(rawParams);
              setLoaderException(
                enrichResourceException(result, {
                  scope: 'loader',
                  identifier: exceptionId,
                }),
                exceptionId,
              );
              return undefined;
            }

            let validatedResult = result;
            if (configuredSchemas.loader) {
              const parsed = await schemaValidation.loader.parseAsync<any>(
                result,
                'loader',
                'loader',
                getIdentifierFromParams(rawParams),
              );
              if (!parsed.accepted) {
                const exceptionId = getIdentifierFromParams(rawParams);
                setLoaderException(
                  enrichResourceException(parsed.exception, {
                    scope: 'loader',
                    identifier: exceptionId,
                  }),
                  exceptionId,
                );
                return undefined;
              }
              validatedResult = parsed.value;
            }

            const successId = getIdentifierFromParams(rawParams);
            setLoaderException(undefined, successId);
            return validatedResult;
          } catch (error) {
            if (!isCraftException(error)) {
              injector.get(TAKE_APP_SNAPSHOT, null)?.();
            }
            throw error;
          } finally {
            if (operationId) correlationSvc?.endOperation(operationId);
          }
        }) as typeof AsyncProcessConfig.loader)
      : undefined;

  const wrappedStream =
    'stream' in AsyncProcessConfig && AsyncProcessConfig.stream
      ? (((...args: unknown[]) => {
          const result = executeGeneratorCompatibleFactory({
            factory: AsyncProcessConfig.stream as (
              ...args: unknown[]
            ) => unknown,
            thisArg: undefined,
            getInjector,
            args,
            invalidYieldErrorMessage: ASYNC_PROCESS_INVALID_YIELD_ERROR_MESSAGE,
            multipleAppStartErrorMessage: ASYNC_PROCESS_APP_START_ERROR_MESSAGE,
            onAppStartNotSupportedErrorMessage:
              ASYNC_PROCESS_APP_START_ERROR_MESSAGE,
          });
          const wrapStreamSignal = (streamSignal: unknown) => {
            if (!configuredSchemas.loader || !isSignal(streamSignal)) {
              return streamSignal;
            }
            let lastValue: unknown;
            return computed(() => {
              const streamItem = (streamSignal as Signal<unknown>)();
              if (
                streamItem &&
                typeof streamItem === 'object' &&
                'error' in streamItem
              ) {
                return streamItem;
              }
              const rawValue =
                streamItem &&
                typeof streamItem === 'object' &&
                'value' in streamItem
                  ? streamItem.value
                  : streamItem;
              const parsed = schemaValidation.loader.parseSync<unknown>(
                rawValue,
                'loader',
                'stream',
              );
              if (!parsed.accepted) {
                return lastValue === undefined
                  ? undefined
                  : { value: lastValue };
              }
              lastValue = parsed.value;
              return { value: lastValue };
            });
          };
          if (
            result &&
            typeof (result as Promise<unknown>).then === 'function'
          ) {
            return Promise.resolve(result).then(wrapStreamSignal);
          }
          return wrapStreamSignal(result);
        }) as typeof AsyncProcessConfig.stream)
      : undefined;

  const resourceParamsSrc = isConnectedToSource
    ? (wrappedSourceParams as typeof AsyncProcessConfig.method)
    : hasParamsFn
      ? wrappedParamsFn
      : AsyncProcessResourceParamsFnSignal;

  // Method-based, non-grouped: feed the resource a nonce-tagged request so every
  // explicit call re-runs the loader (even for identical / `undefined` params),
  // while `resourceParamsSrc` stays the raw signal for all public consumers.
  const usesMethodParamsSignal = !isConnectedToSource && !hasParamsFn;
  const methodTaggedParams = computed(() => {
    const seq = methodTriggerSeq();
    if (seq === 0) return undefined; // idle until the first call
    return wrapMethodParams(AsyncProcessResourceParamsFnSignal(), seq);
  });

  const asyncProcessResourceOptions = {
    ...AsyncProcessConfig,
    params: usesMethodParamsSignal
      ? (methodTaggedParams as unknown as typeof resourceParamsSrc)
      : resourceParamsSrc,
    equal: usesMethodParamsSignal
      ? methodParamsWrapperEqual(
          (AsyncProcessConfig as { equal?: (a: any, b: any) => boolean }).equal,
        )
      : (AsyncProcessConfig as { equal?: (a: any, b: any) => boolean }).equal,
    loader: wrappedLoader,
    stream: wrappedStream,
  } as ResourceOptions<any, any>;

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
        stream: wrappedStream,
        identifier: AsyncProcessConfig.identifier,
      } as any)
    : AsyncProcessConfig.preservePreviousValue?.()
      ? preservedResource<AsyncProcesstate, AsyncProcessParams>(
          asyncProcessResourceOptions,
        )
      : craftResource<AsyncProcesstate, AsyncProcessParams>(
          asyncProcessResourceOptions,
        );

  if (configuredSchemas.loader) {
    const target = resourceTarget as any;
    const originalResourceSet = target.set.bind(target);
    const originalResourceUpdate = target.update.bind(target);
    target.set = (value: unknown) => {
      const parsed = schemaValidation.loader.parseSync<unknown>(
        value,
        'loader',
        'set',
      );
      if (parsed.accepted) originalResourceSet(parsed.value);
    };
    target.update = (updateFn: (current: unknown) => unknown) =>
      originalResourceUpdate((current: unknown) => {
        const parsed = schemaValidation.loader.parseSync<unknown>(
          updateFn(current),
          'loader',
          'update',
        );
        return parsed.accepted ? parsed.value : current;
      });
  }

  runInInjectionContext(getInjector(), () =>
    ɵobservePrimitiveResourceRuntimeContext(
      isUsingIdentifier
        ? ɵcreatePrimitiveResourceByIdRuntimeContext(
            'asyncProcess',
            resourceTarget as any,
          )
        : ɵcreatePrimitiveResourceRuntimeContext(
            'asyncProcess',
            resourceTarget as any,
          ),
    ),
  );

  // Capture the raw Angular status BEFORE `Object.assign` overrides
  // `resourceTarget.status` with the craft computed (avoids a computation cycle).
  const rawResourceStatus = (
    resourceTarget as CraftResourceRef<AsyncProcesstate, AsyncProcessParams>
  ).status;
  const publicExceptions = hasConfiguredSchema
    ? computed(() => ({ ...exceptions(), parse: schemaParse() }))
    : exceptions;

  const asyncOutput = Object.assign(
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

              const rawSelectStatus = resource.status;
              return Object.assign(resource, {
                status: computed(() =>
                  toCraftStatus(rawSelectStatus(), selectHasException()),
                ),
                exception: computed(() => selectExceptions().list[0]),
                hasException: selectHasException,
                hasSchema: signal(hasConfiguredSchema),
                exceptions: hasConfiguredSchema
                  ? computed(() => ({
                      ...selectExceptions(),
                      parse: schemaParse(),
                    }))
                  : selectExceptions,
              });
            })();
          },
          selectOrCreate: (id: GroupIdentifier) => {
            const selected = (
              resourceTarget as ResourceByIdRef<
                GroupIdentifier & string,
                AsyncProcesstate,
                AsyncProcessParams
              >
            ).addById(id as GroupIdentifier & string);
            const selectExceptions = createSelectExceptions(
              id as unknown as string,
            );
            const selectHasException = createSelectHasException(
              id as unknown as string,
            );
            const rawSelectStatus = selected.status;
            return Object.assign(selected, {
              status: computed(() =>
                toCraftStatus(rawSelectStatus(), selectHasException()),
              ),
              exception: computed(() => selectExceptions().list[0]),
              hasException: selectHasException,
              hasSchema: signal(hasConfiguredSchema),
              exceptions: hasConfiguredSchema
                ? computed(() => ({
                    ...selectExceptions(),
                    parse: schemaParse(),
                  }))
                : selectExceptions,
            });
          },
        }
      : {},
    {
      ...(isUsingIdentifier
        ? {}
        : {
            status: computed(() =>
              toCraftStatus(rawResourceStatus(), hasException()),
            ),
            exception: computed(() => exceptions().list[0]),
          }),
      hasException,
      hasSchema: signal(hasConfiguredSchema),
      exceptions: publicExceptions,
      ...(hasParamsFn
        ? { resourceParamsSrc }
        : {
            method: isSignal(AsyncProcessConfig.method)
              ? undefined
              : (arg: AsyncProcessArgsParams) => {
                  let methodArg: unknown = arg;
                  if (configuredSchemas.method) {
                    const parsedMethod =
                      schemaValidation.method.parseSync<unknown>(
                        arg,
                        'method',
                        'method',
                      );
                    if (!parsedMethod.accepted) {
                      methodParamsException.set(
                        enrichResourceException(parsedMethod.exception, {
                          scope: 'params',
                        }),
                      );
                      return yieldableInvocation<
                        MethodYielded,
                        AsyncProcessParams
                      >(parsedMethod.exception as AsyncProcessParams);
                    }
                    methodArg = parsedMethod.value;
                  }
                  const result = executeGeneratorCompatibleFactory({
                    factory: (
                      AsyncProcessConfig as {
                        method: (
                          args: AsyncProcessArgsParams,
                        ) => AsyncProcessParams;
                      }
                    ).method,
                    thisArg: undefined,
                    getInjector,
                    args: [methodArg as AsyncProcessArgsParams],
                    invalidYieldErrorMessage:
                      ASYNC_PROCESS_INVALID_YIELD_ERROR_MESSAGE,
                    multipleAppStartErrorMessage:
                      ASYNC_PROCESS_APP_START_ERROR_MESSAGE,
                    onAppStartNotSupportedErrorMessage:
                      ASYNC_PROCESS_APP_START_ERROR_MESSAGE,
                  });
                  if (isCraftException(result)) {
                    methodParamsException.set(
                      enrichResourceException(result, { scope: 'params' }),
                    );
                    return yieldableInvocation<
                      MethodYielded,
                      AsyncProcessParams
                    >(result as AsyncProcessParams);
                  }

                  let paramsResult = result as AsyncProcessParams;
                  if (configuredSchemas.params) {
                    const parsedParams =
                      schemaValidation.params.parseSync<AsyncProcessParams>(
                        result,
                        'params',
                        'method',
                      );
                    if (!parsedParams.accepted) {
                      methodParamsException.set(
                        enrichResourceException(parsedParams.exception, {
                          scope: 'params',
                        }),
                      );
                      return yieldableInvocation<
                        MethodYielded,
                        AsyncProcessParams
                      >(parsedParams.exception as AsyncProcessParams);
                    }
                    paramsResult = parsedParams.value;
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
                  // Bump before the set so both writes land in the same tick and
                  // the resource request changes on every call.
                  methodTriggerSeq.update((n) => n + 1);
                  AsyncProcessResourceParamsFnSignal.set(paramsResult);
                  return yieldableInvocation<MethodYielded, AsyncProcessParams>(
                    paramsResult,
                  );
                },
          }),
    },
  ) as unknown as AsyncProcessOutput<
    AsyncProcesstate,
    AsyncProcessParams,
    AsyncProcessArgsParams,
    SourceParams,
    GroupIdentifier,
    {},
    Exceptions,
    {},
    false,
    MethodYielded
  >;

  const insertionsResult = (
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
      const rawResult = executeGeneratorCompatibleFactory({
        factory: insert as (context: unknown) => Record<string, unknown>,
        thisArg: undefined,
        getInjector,
        args: [
          {
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
            __primitiveKind: 'asyncProcess',
          } as any,
        ],
        invalidYieldErrorMessage: ASYNC_PROCESS_INVALID_YIELD_ERROR_MESSAGE,
        multipleAppStartErrorMessage: ASYNC_PROCESS_APP_START_ERROR_MESSAGE,
        onAppStartNotSupportedErrorMessage:
          ASYNC_PROCESS_APP_START_ERROR_MESSAGE,
      });
      const wrappedResult = Object.entries(rawResult).reduce(
        (wrappedAcc, [key, value]) => {
          if (
            typeof value === 'function' &&
            !isSignal(value) &&
            !isNonYieldableInsertionMethod(value)
          ) {
            const injector = getInjector();
            const methodInjector = ɵcreateHostTaggedInjector(
              injector,
              `method:${key}`,
              [
                ɵprovidePrimitiveMethodRuntimeContext(
                  'asyncProcess',
                  {
                    state: resourceTarget.state,
                    set: resourceTarget.set,
                    update: resourceTarget.update,
                    patch: (patchFn) =>
                      resourceTarget.update((current: any) => ({
                        ...current,
                        ...patchFn(current),
                      })),
                  },
                  value as (...args: never[]) => unknown,
                ),
              ],
            );
            const wrappedFn = runInInjectionContext(methodInjector, () =>
              injectFnWrapper()(value as (...args: unknown[]) => unknown),
            );
            wrappedAcc[key] = createYieldableInsertionMethod(wrappedFn, {
              injector: methodInjector,
              invalidYieldErrorMessage:
                ASYNC_PROCESS_INVALID_YIELD_ERROR_MESSAGE,
              multipleAppStartErrorMessage:
                ASYNC_PROCESS_APP_START_ERROR_MESSAGE,
              onAppStartNotSupportedErrorMessage:
                ASYNC_PROCESS_APP_START_ERROR_MESSAGE,
            });
          } else {
            wrappedAcc[key] = value;
          }
          return wrappedAcc;
        },
        {} as Record<string, unknown>,
      );
      return { ...acc, ...wrappedResult };
    },
    {} as Record<string, unknown>,
  );

  Object.assign(asyncOutput, insertionsResult);

  const snapshotRegistry = injector
    ? injector.get(APP_SNAPSHOT_REGISTRY, null)
    : (() => {
        try {
          return inject(APP_SNAPSHOT_REGISTRY, { optional: true });
        } catch {
          return null;
        }
      })();

  const hostTagList: readonly string[] = injector
    ? (injector.get(ɵHOST_TAG_LIST, null) ?? [])
    : (() => {
        try {
          return inject(ɵHOST_TAG_LIST, { optional: true }) ?? [];
        } catch {
          return [];
        }
      })();

  const destroyRefAsync = injector
    ? injector.get(DestroyRef, null)
    : (() => {
        try {
          return inject(DestroyRef, { optional: true });
        } catch {
          return null;
        }
      })();

  if (snapshotRegistry && destroyRefAsync) {
    snapshotRegistry.triggerSnapshot$
      .pipe(takeUntilDestroyed(destroyRefAsync))
      .subscribe(() => {
        const insertionSnapshots = triggerAndCollectInsertions(
          insertionSnapshotRegistry,
        );
        let stateSnapshot: unknown;
        try {
          if (isUsingIdentifier) {
            const byId = (resourceTarget as any)();
            stateSnapshot = {
              params: AsyncProcessResourceParamsFnSignal(),
              resources: Object.entries(byId ?? {}).reduce(
                (acc, [id, res]: [string, any]) => {
                  acc[id] = res?.state?.();
                  return acc;
                },
                {} as Record<string, unknown>,
              ),
              ...(insertionSnapshots ? { insertions: insertionSnapshots } : {}),
            };
          } else {
            const resourceState = (asyncOutput as any).state();
            stateSnapshot = {
              params: AsyncProcessResourceParamsFnSignal(),
              ...resourceState,
              ...(insertionSnapshots ? { insertions: insertionSnapshots } : {}),
            };
          }
        } catch (error) {
          stateSnapshot = {
            error: error instanceof Error ? error.message : String(error),
          };
        }
        snapshotRegistry.allSnapShot$.next({
          source: 'asyncProcess',
          from: hostTagList,
          state: stateSnapshot,
        });
      });
  }

  if (!isUsingIdentifier) {
    attachCraftSettledValue(name, asyncOutput as object);
  }

  return asyncOutput;
}
