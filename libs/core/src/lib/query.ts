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
  ResourceRef,
  ResourceStreamingLoader,
  runInInjectionContext,
  Signal,
  signal,
  untracked,
  WritableSignal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  InsertionsResourcesFactory,
  ResourceExceptionConstraints,
} from './query.core';
import {
  executeGeneratorCompatibleFactory,
  GeneratorCompatibleFactory,
  isGeneratorFunction,
} from './craft-generator-runtime';
import { executeGeneratorCompatibleFactoryAsync } from './craft-program-runtime';
import type { ExtractCraftGenExceptions } from './craft-gen';
import { resourceById, ResourceByIdRef } from './resource-by-id';
import { ReadonlySource } from './util/source.type';
import {
  CraftResourceStatus,
  toCraftStatus,
} from './util/craft-resource-status';
import { MergeObjects } from './util/util.type';
import {
  methodParamsWrapperEqual,
  unwrapMethodParams,
  wrapMethodParams,
} from './util/method-trigger-nonce';
import { preservedResource } from './preserved-resource';
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
import { CORRELATION_ID_SERVICE } from './correlation-id';
import {
  createNamedPrimitiveGen,
  type CraftPrimitiveGen,
  type NamedCraftPrimitiveGen,
} from './craft-primitive-gen';
import {
  APP_SNAPSHOT_REGISTRY,
  INSERTION_SNAPSHOT_REGISTRY,
  InsertionSnapshotRegistry,
  TAKE_APP_SNAPSHOT,
  triggerAndCollectInsertions,
} from './take-app-snapshot';
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
  type YieldableInvocation,
} from './yieldable';
import type {
  BrandReactiveProperties,
  YieldableInsertionMethods,
} from './yieldable';
import {
  createSchemaValidationRuntime,
  type CraftSchema,
  type SchemaInput,
  type SchemaOutput,
  type SchemaParseExceptions,
  type SchemaValidationPolicy,
  useSchemaValidationPolicy,
} from './schema-validation';

type QueryConfigProviderNames<Providers> =
  Providers extends readonly (infer P)[]
    ? P extends BrandedServiceProvider<infer Name, any, any>
      ? Name
      : never
    : never;

type SatisfyDependencies<Deps, SatisfiedNames extends string> = {
  [K in keyof Deps as K extends SatisfiedNames ? never : K]: Deps[K];
};

type QueryTrackedDependencies<
  ParamsYielded = never,
  MethodYielded = never,
  LoaderYielded = never,
  StreamYielded = never,
  InsertionsYielded = never,
  Providers = never,
  Insertions = never,
> = [QueryConfigProviderNames<Providers>] extends [never]
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
      QueryConfigProviderNames<Providers>
    >;

type QueryDependenciesMetadata<Dependencies> = [keyof Dependencies] extends [
  never,
]
  ? {}
  : {
      readonly [SERVICE_HELPER_DEPENDENCIES]?: Dependencies;
    };

const QUERY_INVALID_YIELD_ERROR_MESSAGE =
  'query generators can only yield craftService dependencies or exposed dependency helpers.';
const QUERY_APP_START_ERROR_MESSAGE =
  'query generators do not support onAppStart(...).';

type QueryConfig<
  ResourceState,
  Params,
  ParamsArgs,
  SourceParams,
  GroupIdentifier,
  FromObjectGroupIdentifier extends string,
  FromObjectState,
  FromObjectResourceParams,
  ParamsYielded = never,
  MethodYielded = never,
  LoaderYielded = never,
  StreamYielded = never,
> = Omit<ResourceOptions<NoInfer<ResourceState>, Params>, 'params' | 'loader'> &
  (
    | {
        /**
         * A reactive function which determines the request to be made. Whenever the request changes, the
         * loader will be triggered to fetch a new value for the resource.
         *
         * If a request function isn't provided, the loader won't rerun unless the resource is reloaded.
         */
        params: GeneratorCompatibleFactory<() => Params, ParamsYielded>;
        loader: GeneratorCompatibleFactory<
          (
            param: NoInfer<ResourceLoaderParams<StripCraftException<Params>>>,
          ) => Promise<ResourceState>,
          LoaderYielded
        >;
        method?: never;
        fromResourceById?: never;
        stream?: never;
        /**
         * Each the query load, the value will return undefined.
         * To avoid flickering display and also enable to the data to be retrieved from cache, use () => true
         * default value: true
         */
        preservePreviousValue?: () => boolean;
      }
    | {
        /**
         * Used to generate a method in the store, when called will trigger the resource loader/stream.
         *
         * Only support one parameter which can be an object to pass multiple parameters.
         *
         * It also accepts a ReadonlySource<SourceParams> to connect the query params to an external signal source.
         */
        method:
          | GeneratorCompatibleFactory<
              (args: ParamsArgs) => Params,
              MethodYielded
            >
          | ReadonlySource<SourceParams>;
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
        fromResourceById?: never;
        stream?: never;
        preservePreviousValue?: () => boolean;
      }
    | {
        method?: never;
        loader?: never;
        params?: GeneratorCompatibleFactory<() => Params, ParamsYielded>;
        fromResourceById?: never;
        /**
         * Loading function which returns a `Promise` of a signal of the resource's value for a given
         * request, which can change over time as new values are received from a stream.
         */
        stream: GeneratorCompatibleFactory<
          ResourceStreamingLoader<ResourceState, Params>,
          StreamYielded
        >;
        preservePreviousValue?: () => boolean;
      }
    | {
        method: ((args: ParamsArgs) => Params) | ReadonlySource<SourceParams>;
        loader?: never;
        params?: never;
        fromResourceById?: never;
        /**
         * Loading function which returns a `Promise` of a signal of the resource's value for a given
         * request, which can change over time as new values are received from a stream.
         */
        stream: ResourceStreamingLoader<ResourceState, Params>;
        preservePreviousValue?: () => boolean;
      }
    | {
        /**
         * Use it, when you need to bind a ResourceByIdRef to another ResourceByIdRef.
         * It will enforce the fromObject keys syncing when the fromObject resource change.
         */
        fromResourceById: ResourceByIdRef<
          FromObjectGroupIdentifier,
          FromObjectState,
          FromObjectResourceParams
        >;
        /**
         * A reactive function which determines the request to be made. Whenever the request changes, the
         * loader will be triggered to fetch a new value for the resource.
         *
         * If a request function isn't provided, the loader won't rerun unless the resource is reloaded.
         */
        params: GeneratorCompatibleFactory<
          (entity: ResourceRef<NoInfer<FromObjectState>>) => Params,
          ParamsYielded
        >;
        loader: GeneratorCompatibleFactory<
          (
            param: NoInfer<ResourceLoaderParams<Params>>,
          ) => Promise<ResourceState>,
          LoaderYielded
        >;
        method?: never;
        stream?: never;
        /**
         * Each the query load, the value will return undefined.
         * To avoid flickering display and also enable to the data to be retrieved from cache, use () => true
         * default value: true
         */
        preservePreviousValue?: () => boolean;
      }
    | {
        method?: never;
        loader?: never;
        params?: GeneratorCompatibleFactory<() => Params, ParamsYielded>;
        fromResourceById?: never;
        /**
         * Loading function which returns a `Promise` of a signal of the resource's value for a given
         * request, which can change over time as new values are received from a stream.
         */
        stream: GeneratorCompatibleFactory<
          ResourceStreamingLoader<ResourceState, Params>,
          StreamYielded
        >;
        preservePreviousValue?: () => boolean;
      }
  ) & {
    methodSchema?: CraftSchema;
    paramsSchema?: CraftSchema;
    loaderSchema?: CraftSchema;
    schemaValidationPolicy?: SchemaValidationPolicy;
    /**
     * A unique identifier for the resource, derived from the params.
     * It should be a string that uniquely identifies the resource based on the params.
     */
    identifier?: (
      params: NoInfer<NonNullable<StripCraftException<Params>>>,
    ) => GroupIdentifier;
    /**
     * Under the hood, a resource is generated for each new identifier generated when the params source change.
     *
     * If the source change, and their is an existing resource with the same identifier, it will be re-used.
     *
     * In this case, when the source is an object, an existing resource can be retrieved by the matching his record key with identifier function, but as the reference change it will trigger the loading of the resource again.
     *
     * To avoid this, you can use this option to tell how to compare the incoming params with the existing params of the resource.
     * - 'useIdentifier': will use the identifier function to compare the previous params and the incoming params. This very useful when using pagination.
     * - 'default' (default value): will use a strict equality check (===) between the previous params and the incoming params.
     * - (a: Params, b: Params) => boolean: you can provide your own comparison function to compare the previous params and the incoming params. This is useful when you want to compare specific fields of the params.
     *
     * Note: if your params is a primitive (string, number, boolean, etc.), you don't need to use this option since the strict equality check will work as expected.
     *
     * For **query** that use 'identifier', the default value is 'useIdentifier'
     *
     * For **query** that don't use 'identifier', the default value is 'default'
     */
    equalParams?: Params extends object
      ?
          | 'default'
          | 'useIdentifier'
          | ((
              a: Params,
              b: Params,
              identifierFn: (params: Params) => GroupIdentifier,
            ) => boolean)
      : never;
  };

export type ResourceLikeExceptions<
  QueryException extends ResourceExceptionConstraints,
  GroupIdentifier = unknown,
> = {
  hasException: Signal<boolean>;
  exception: Signal<
    | InsertMetaInCraftExceptionIfExists<
        QueryException['params'],
        'params',
        unknown
      >
    | InsertMetaInCraftExceptionIfExists<
        QueryException['loader'],
        'loader',
        GroupIdentifier
      >
    | undefined
  >;
  exceptions: Signal<{
    list: (
      | InsertMetaInCraftExceptionIfExists<
          QueryException['params'],
          'params',
          unknown
        >
      | InsertMetaInCraftExceptionIfExists<
          QueryException['loader'],
          'loader',
          GroupIdentifier
        >
    )[];
    params?: InsertMetaInCraftExceptionIfExists<
      QueryException['params'],
      'params',
      unknown
    >;
    loader?: InsertMetaInCraftExceptionIfExists<
      QueryException['loader'],
      'loader',
      GroupIdentifier
    >;
  }> & (QueryException extends { parse: infer Parse } ? { parse: Parse } : {});
};

export type ResourceByIdLikeExceptions<
  QueryException extends ResourceExceptionConstraints,
  GroupIdentifier extends string,
> = {
  hasException: Signal<boolean>;
  exceptions: Signal<{
    list: (
      | InsertMetaInCraftExceptionIfExists<
          QueryException['params'],
          'params',
          unknown
        >
      | InsertMetaInCraftExceptionIfExists<
          QueryException['loader'],
          'loader',
          GroupIdentifier
        >
    )[];
    params?: InsertMetaInCraftExceptionIfExists<
      QueryException['params'],
      'params',
      unknown
    >;
    loader: Partial<
      Record<
        GroupIdentifier,
        InsertMetaInCraftExceptionIfExists<
          QueryException['loader'],
          'loader',
          GroupIdentifier
        >
      >
    >;
  }> & (QueryException extends { parse: infer Parse } ? { parse: Parse } : {});
};

export type ResourceLikeQueryRef<
  Value,
  Params,
  IsMethod,
  ArgParams,
  SourceParams,
  Insertions,
  QueryException extends ResourceExceptionConstraints,
  Dependencies = {},
  HasSchema extends boolean = false,
  MethodYielded = never,
> = (HasSchema extends true ? { readonly hasSchema: Signal<true> } : {}) & {
  type: 'resourceLike';
  kind: 'query';
} & (HasSchema extends true
  ? {
      set(value: Value): void;
      update(updateFn: (current: Value) => Value): void;
    }
  : {}) & MergeObjects<
  [
    {
      readonly value: Signal<Value | undefined>;
      readonly status: Signal<CraftResourceStatus>;
      readonly isLoading: Signal<boolean>;
      hasValue(): boolean;
    },
    {
      readonly resourceParamsSrc: WritableSignal<NoInfer<Params>>;
    },
    IsMethod extends true
      ? {
          call: (args: ArgParams) => YieldableInvocation<MethodYielded, Params>;
        }
      : {
          source: ReadonlySource<SourceParams>;
        },
    YieldableInsertionMethods<Insertions>,
    ResourceLikeExceptions<QueryException>,
    {
      [key in `~InternalType`]: 'Used to avoid TS type erasure';
    },
    QueryDependenciesMetadata<Dependencies>,
  ]
>;

export type ResourceByIdLikeQueryRef<
  Value,
  Params,
  IsMethod,
  ArgParams,
  SourceParams,
  Insertions,
  GroupIdentifier,
  QueryException extends ResourceExceptionConstraints,
  Dependencies = {},
  HasSchema extends boolean = false,
  MethodYielded = never,
> = (HasSchema extends true ? { readonly hasSchema: Signal<true> } : {}) & {
  type: 'resourceByGroupLike';
  kind: 'query';
  readonly resourceParamsSrc: WritableSignal<NoInfer<Params>>;
} & {
  _resourceById: ResourceByIdRef<GroupIdentifier & string, Value, Params>;
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
      } & ResourceLikeExceptions<QueryException, GroupIdentifier>) // todo exception params should be display outside
    | undefined;
  /**
   * Get the associated resource by id, creating an idle resource when it does
   * not exist yet.
   */
  selectOrCreate: (id: GroupIdentifier) =>
    {
      readonly value: Signal<Value | undefined>;
      readonly status: Signal<CraftResourceStatus>;
      readonly isLoading: Signal<boolean>;
      hasValue(): boolean;
    } & ResourceLikeExceptions<QueryException, GroupIdentifier>;
} & MergeObjects<
    [
      YieldableInsertionMethods<Insertions>,
      IsMethod extends true
        ? {
            call: (args: ArgParams) =>
              YieldableInvocation<MethodYielded, Params>;
          }
        : {
            source: ReadonlySource<SourceParams>;
          },
      ResourceByIdRef<GroupIdentifier & string, Value, Params>,
      [GroupIdentifier] extends [string]
        ? ResourceByIdLikeExceptions<QueryException, GroupIdentifier>
        : {},
      QueryDependenciesMetadata<Dependencies>,
    ]
  >;

export type QueryRef<
  Value,
  Params,
  ArgParams,
  Insertions,
  IsMethod,
  SourceParams,
  GroupIdentifier,
  QueryExceptions extends ResourceExceptionConstraints,
  Dependencies = {},
  HasSchema extends boolean = false,
  MethodYielded = never,
> = [unknown] extends [GroupIdentifier]
  ? ResourceLikeQueryRef<
      Value,
      Params,
      IsMethod,
      ArgParams,
      SourceParams,
      Insertions,
      QueryExceptions,
      Dependencies,
      HasSchema,
      MethodYielded
    >
  : ResourceByIdLikeQueryRef<
      Value,
      Params,
      IsMethod,
      ArgParams,
      SourceParams,
      Insertions,
      GroupIdentifier,
      QueryExceptions,
      Dependencies,
      HasSchema,
      MethodYielded
    >;

export type QueryOutput<
  State extends object | undefined,
  Params,
  ArgParams,
  SourceParams,
  GroupIdentifier,
  Insertions,
  QueryExceptions extends ResourceExceptionConstraints,
  Dependencies = {},
  HasSchema extends boolean = false,
  MethodYielded = never,
> = QueryRef<
  State,
  Params,
  ArgParams,
  YieldableInsertionMethods<BrandReactiveProperties<Insertions>>,
  [unknown] extends [ArgParams] ? false : true, // ! force to method to have one arg minimum, we can not compare SourceParams type, because it also infer Params
  SourceParams,
  GroupIdentifier,
  QueryExceptions,
  Dependencies,
  HasSchema,
  MethodYielded
>;

type SchemaQueryConfig<
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

export function query<
  Name extends string,
  MethodSchema extends CraftSchema,
  ParamsSchema extends CraftSchema,
  LoaderSchema extends CraftSchema,
>(
  name: Name,
  queryConfig: SchemaQueryConfig<MethodSchema, ParamsSchema, LoaderSchema>,
): NamedCraftPrimitiveGen<
  Name,
  QueryOutput<
    SchemaOutput<LoaderSchema>,
    SchemaOutput<ParamsSchema>,
    SchemaInput<MethodSchema>,
    SchemaOutput<ParamsSchema>,
    unknown,
    {},
    ResourceExceptionConstraints & { parse: SchemaParseExceptions },
    {},
    true
  >
>;

export function query<
  Name extends string,
  ParamsSchema extends CraftSchema,
  ParamsState extends object | undefined,
>(
  name: Name,
  queryConfig: {
    paramsSchema: ParamsSchema;
    params: (...args: never[]) => unknown;
    loader: (
      param: ResourceLoaderParams<SchemaOutput<ParamsSchema>>,
    ) => Promise<ParamsState> | ParamsState;
    [key: string]: unknown;
  },
): NamedCraftPrimitiveGen<
  Name,
  QueryOutput<
    ParamsState,
    SchemaOutput<ParamsSchema>,
    unknown,
    SchemaOutput<ParamsSchema>,
    unknown,
    {},
    ResourceExceptionConstraints & { parse: SchemaParseExceptions },
    {},
    true
  >
>;

export function query<
  Name extends string,
  LoaderSchema extends CraftSchema,
  LoaderParams,
>(
  name: Name,
  queryConfig: {
    loaderSchema: LoaderSchema;
    params: () => LoaderParams;
    loader: (
      param: ResourceLoaderParams<LoaderParams>,
    ) => Promise<SchemaInput<LoaderSchema>> | SchemaInput<LoaderSchema>;
    [key: string]: unknown;
  },
): NamedCraftPrimitiveGen<
  Name,
  QueryOutput<
    SchemaOutput<LoaderSchema>,
    LoaderParams,
    unknown,
    LoaderParams,
    unknown,
    {},
    ResourceExceptionConstraints & { parse: SchemaParseExceptions },
    {},
    true
  >
>;

export function query<
  Name extends string,
  LoaderSchema extends CraftSchema,
  LoaderParams,
  LoaderArgs,
>(
  name: Name,
  queryConfig: {
    loaderSchema: LoaderSchema;
    method: (args: LoaderArgs) => LoaderParams;
    loader: (
      param: ResourceLoaderParams<LoaderParams>,
    ) => Promise<SchemaInput<LoaderSchema>> | SchemaInput<LoaderSchema>;
    [key: string]: unknown;
  },
): NamedCraftPrimitiveGen<
  Name,
  QueryOutput<
    SchemaOutput<LoaderSchema>,
    LoaderParams,
    LoaderArgs,
    LoaderParams,
    unknown,
    {},
    ResourceExceptionConstraints & { parse: SchemaParseExceptions },
    {},
    true
  >
>;

export function query<
  Name extends string,
  MethodSchema extends CraftSchema,
  Params,
  State extends object | undefined,
>(
  name: Name,
  queryConfig: {
    methodSchema: MethodSchema;
    method: (args: SchemaOutput<MethodSchema>) => Params;
    loader: (
      param: ResourceLoaderParams<Params>,
    ) => Promise<State> | State;
    [key: string]: unknown;
  },
): NamedCraftPrimitiveGen<
  Name,
  QueryOutput<
    State,
    Params,
    SchemaInput<MethodSchema>,
    Params,
    unknown,
    {},
    ResourceExceptionConstraints & { parse: SchemaParseExceptions },
    {},
    true
  >
>;

export function query<
  Name extends string,
  QueryState extends object | undefined,
  QueryParams,
  QueryArgsParams,
  SourceParams,
  GroupIdentifier,
  FromObjectGroupIdentifier extends string,
  FromObjectState,
  FromObjectResourceParams,
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
  Exceptions extends ResourceExceptionConstraints = {
    params: ExtractCraftException<QueryParams>;
    loader:
      | ExtractCraftException<QueryState>
      | Extract<ExtractCraftGenExceptions<LoaderYielded>, AnyCraftException>;
  },
>(
  name: Name,
  queryConfig: QueryConfig<
    QueryState,
    QueryParams,
    QueryArgsParams,
    SourceParams,
    GroupIdentifier,
    FromObjectGroupIdentifier,
    FromObjectState,
    FromObjectResourceParams,
    ParamsYielded,
    MethodYielded,
    LoaderYielded,
    StreamYielded
  > &
    Config,
): NamedCraftPrimitiveGen<
  Name,
  QueryOutput<
    StripCraftException<QueryState>,
    StripCraftException<QueryParams>,
    QueryArgsParams,
    StripCraftException<QueryParams>,
    GroupIdentifier,
    {},
    Exceptions,
    QueryTrackedDependencies<
      ParamsYielded,
      MethodYielded,
      LoaderYielded,
      StreamYielded,
      never,
      Providers
    >,
    false,
    MethodYielded
  >
>;
export function query<
  Name extends string,
  QueryState extends object | undefined,
  QueryParams,
  QueryArgsParams,
  SourceParams,
  GroupIdentifier,
  FromObjectGroupIdentifier extends string,
  FromObjectState,
  FromObjectResourceParams,
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
  Exceptions extends ResourceExceptionConstraints = {
    params: ExtractCraftException<QueryParams>;
    loader:
      | ExtractCraftException<QueryState>
      | Extract<ExtractCraftGenExceptions<LoaderYielded>, AnyCraftException>;
  },
>(
  name: Name,
  queryConfig: QueryConfig<
    QueryState,
    QueryParams,
    QueryArgsParams,
    SourceParams,
    GroupIdentifier,
    FromObjectGroupIdentifier,
    FromObjectState,
    FromObjectResourceParams,
    ParamsYielded,
    MethodYielded,
    LoaderYielded,
    StreamYielded
  > &
    Config,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<QueryState>>,
    NoInfer<StripCraftException<QueryParams>>,
    NoInfer<Exceptions>,
    Insertion1,
    {},
    Insertion1Yielded
  >,
): NamedCraftPrimitiveGen<
  Name,
  QueryOutput<
    StripCraftException<QueryState>,
    StripCraftException<QueryParams>,
    QueryArgsParams,
    StripCraftException<QueryParams>,
    GroupIdentifier,
    Insertion1,
    Exceptions,
    QueryTrackedDependencies<
      ParamsYielded,
      MethodYielded,
      LoaderYielded,
      StreamYielded,
      Insertion1Yielded,
      Providers,
      Insertion1
    >,
    false,
    MethodYielded
  >
>;
/**
 * Creates a reactive query manager that handles data fetching with automatic state tracking.
 *
 * This function manages query state by:
 * - Executing asynchronous fetch operations (loader or stream) automatically when params change
 * - Tracking operation status (idle, loading, resolved, exception)
 * - Providing reactive signals for value, status, exceptions, and loading state
 * - Supporting both params-based automatic execution and method-based manual triggers
 * - Optionally enabling parallel query execution by grouping instances with an identifier
 * - Caching and reusing query results based on params
 *
 * @remarks
 * **Important:** This function must be called within an injection context.
 *
 * **Query Modes:**
 * - **Params-based (automatic):** Define a `params` function. The query executes automatically when params change.
 * - **Method-based (manual):** Define a `method` function that returns params. Call `call()` to trigger execution.
 * - **Source-based (reactive):** Bind to a `ReadonlySource` for automatic execution when the source changes.
 * - **Resource-based (derived):** Bind to another `ResourceByIdRef` using `fromResourceById` to create derived queries.
 *
 * **With Identifier:**
 * When an `identifier` function is provided, queries are grouped by ID enabling parallel execution and individual result tracking.
 * Use `select(id)` to access individual query instances.
 * Use `selectOrCreate(id)` to access an instance, creating it when it does not exist yet.
 *
 * **Caching & Performance:**
 * - Use `preservePreviousValue: () => true` to prevent flickering by keeping previous data while loading
 * - Use `equalParams` to control when queries should re-execute based on params comparison
 *
 * @param name - The query name. Used for host tagging and reactive branding
 *   (`const userQuery = yield* query('userQuery', config)`) and as the
 *   injector host tag (`query:userQuery`), so the query is precisely locatable
 *   in snapshots and logs.
 * @param config - Configuration object containing:
 *   - `params`: Function that returns params for automatic execution, or undefined for method-based queries
 *   - `method`: Function that takes args and returns params for manual execution, or a `ReadonlySource` for reactive execution
 *   - `loader`: Async function that performs the query and returns a Promise of the result
 *   - `stream` (optional): Async function that returns a signal for streaming results
 *   - `identifier` (optional): Function to derive a unique ID from params for grouping queries
 *   - `fromResourceById` (optional): Bind to another ResourceByIdRef for derived queries
 *   - `preservePreviousValue` (optional): Function returning boolean to keep previous value while reloading
 *   - `equalParams` (optional): Controls params comparison ('default' | 'useIdentifier' | custom function)
 *   - Additional ResourceOptions like `equal`, `injector`, etc.
 * @param insertion1 - Optional single insertion factory to add custom methods, computed values or side effects to the query.
 *   The insertion receives a context with resource signals (`state`, `exceptions`, `hasException`, `resource`) and mutators (`set`, `update`, `patch`).
 *   To attach several insertions, compose them with `insertQueryPipe`:
 *   `query('name', config, insertQueryPipe(insertion1, insertion2))` —
 *   each member then also sees the previous members' outputs on `context.insertions`.
 * @returns A single-use primitive generator resolving to a query reference
 *   object with:
 *   - `value`: Signal containing the query result (undefined if not yet executed)
 *   - `status`: Signal with the craft status ('idle' | 'loading' | 'reloading' | 'resolved' | 'local' | 'exception')
 *   - `exception`: Signal with the primary `craftException` (or undefined)
 *   - `exceptions`: Signal with the captured exceptions (`list` / `params` / `loader`)
 *   - `hasException()`: Signal indicating whether an exception is captured
 *   - `isLoading`: Signal indicating if the query is currently executing
 *   - `hasValue()`: Method to check if a value is available
 *   - `call(args)`: Method to trigger the query manually (only for method-based queries)
 *   - `source`: The connected source (only for source-based queries)
 *   - `select(id)`: Method to access a specific query instance by ID (only when identifier is provided)
 *   - `selectOrCreate(id)`: Method to access or create a specific query instance (only when identifier is provided)
 *   - `resourceParamsSrc`: The underlying params signal
 *   - Custom methods from insertions
 *
 *   Consume it with `yield*` inside a generator host (craftService factory,
 *   craftGen, …) or with `craftUse(...)` elsewhere (typically a component field).
 *
 * @example
 * Basic params-based automatic query
 * ```ts
 * const userIdSignal = signal('user-123');
 *
 * const userQuery = craftUse(query('userQuery', {
 *   params: () => userIdSignal(),
 *   loader: async ({ params }) => {
 *     const response = await fetch(`/api/users/${params}`);
 *     return response.json();
 *   },
 * }));
 *
 * // Query executes automatically when created and when userIdSignal changes
 * console.log(userQuery.status()); // 'loading'
 * // After completion
 * console.log(userQuery.value()); // { id: 'user-123', name: '...' }
 * console.log(userQuery.status()); // 'resolved'
 *
 * // Changing the signal triggers a new query
 * userIdSignal.set('user-456');
 * ```
 *
 * @example
 * Method-based manual query
 * ```ts
 * const searchQuery = craftUse(query('searchQuery', {
 *   method: (searchTerm: string) => ({ term: searchTerm }),
 *   loader: async ({ params }) => {
 *     const response = await fetch(`/api/search?q=${params.term}`);
 *     return response.json();
 *   },
 * }));
 *
 * // Query doesn't execute automatically
 * console.log(searchQuery.status()); // 'idle'
 *
 * // Manually trigger the query
 * searchQuery.call('angular');
 * console.log(searchQuery.status()); // 'loading'
 * ```
 *
 * @example
 * Business exceptions with `craftException`
 * ```ts
 * import { craftException, query } from '@craft-ng/core';
 *
 * const userQuery = craftUse(query('userQuery', {
 *   method: (value: string) =>
 *     value.length < 3
 *       ? craftException(
 *           { code: 'SEARCH_TERM_TOO_SHORT' },
 *           { min: 3, received: value.length },
 *         )
 *       : value,
 *   loader: async ({ params }) =>
 *     params === 'forbidden'
 *       ? craftException(
 *           { code: 'USER_ACCESS_FORBIDDEN' },
 *           { id: params },
 *         )
 *       : { id: params, name: 'John Doe' },
 * }));
 *
 * userQuery.call('ab');
 * console.log(userQuery.hasException()); // true
 * console.log(userQuery.exceptions().params?.SEARCH_TERM_TOO_SHORT);
 *
 * userQuery.call('forbidden');
 * console.log(userQuery.exceptions().loader?.USER_ACCESS_FORBIDDEN);
 * ```
 *
 * @example
 * Query with identifier for parallel execution
 * ```ts
 * const userDetailsQuery = craftUse(query('userDetailsQuery', {
 *   params: () => currentUserId(),
 *   identifier: (userId) => userId,
 *   loader: async ({ params }) => {
 *     const response = await fetch(`/api/users/${params}`);
 *     return response.json();
 *   },
 * }));
 *
 * // Multiple users can be queried in parallel
 * // Each has its own state tracked by identifier
 * const user1 = userDetailsQuery.select('user-1');
 * const user2 = userDetailsQuery.select('user-2');
 *
 * console.log(user1?.status()); // 'resolved'
 * console.log(user1?.value()); // { id: 'user-1', ... }
 * console.log(user2?.status()); // 'loading'
 * ```
 *
 * @example
 * With custom methods via insertions
 * ```ts
 * const todosQuery = craftUse(query(
 *   'todosQuery',
 *   {
 *     params: () => ({ completed: showCompleted() }),
 *     loader: async ({ params }) => {
 *       const response = await fetch(`/api/todos?completed=${params.completed}`);
 *       return response.json();
 *     },
 *   },
 *   ({ value, isLoading }) => ({
 *     count: computed(() => value()?.length ?? 0),
 *     isEmpty: computed(() => !isLoading() && value()?.length === 0),
 *   })
 * ));
 *
 * console.log(todosQuery.count()); // Custom computed from insertion
 * console.log(todosQuery.isEmpty()); // true/false
 * ```
 *
 * @example
 * Streaming query
 * ```ts
 * const liveDataQuery = craftUse(query('liveDataQuery', {
 *   params: () => ({ channel: currentChannel() }),
 *   stream: async ({ params }) => {
 *     const response = await fetch(`/api/stream/${params.channel}`);
 *
 *     // Return a signal that updates as stream data arrives
 *     const resultSignal = signal([]);
 *     const reader = response.body?.getReader();
 *     // ... process stream and update resultSignal
 *     return resultSignal;
 *   },
 * }));
 *
 * // value() updates continuously as stream data arrives
 * ```
 *
 * @example
 * Derived query from another ResourceByIdRef
 * ```ts
 * // First query fetches basic user data
 * const usersQuery = craftUse(query('usersQuery', {
 *   params: () => currentUserId(),
 *   identifier: (userId) => userId,
 *   loader: async ({ params }) => {
 *     const response = await fetch(`/api/users/${params}`);
 *     return response.json();
 *   },
 * }));
 *
 * // Derived query enriches user data with additional info
 * const enrichedUsersQuery = craftUse(query('enrichedUsersQuery', {
 *   fromResourceById: usersQuery,
 *   params: ({ value, status }) => {
 *     // Only process when source is resolved
 *     return status() === 'resolved' ? value() : undefined;
 *   },
 *   identifier: (user) => user.id,
 *   loader: async ({ params }) => {
 *     // Fetch additional data for the user
 *     const response = await fetch(`/api/users/${params.id}/details`);
 *     const details = await response.json();
 *     return { ...params, ...details };
 *   },
 * }));
 *
 * // Derived query executes automatically when usersQuery resolves
 * const enrichedUser = enrichedUsersQuery.select('user-123');
 * console.log(enrichedUser?.value()); // { ...userData, ...details }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function query(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryConfig: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...insertions: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  return createNamedPrimitiveGen(
    name,
    createQueryRef(name, queryConfig, ...insertions),
  );
}

function createQueryRef<
  QueryState extends object | undefined,
  QueryParams,
  QueryArgsParams,
  SourceParams,
  GroupIdentifier,
  FromObjectGroupIdentifier extends string,
  FromObjectState,
  FromObjectResourceParams,
  ParamsYielded = never,
  MethodYielded = never,
  LoaderYielded = never,
  StreamYielded = never,
>(
  name: string,
  queryConfig: QueryConfig<
    QueryState,
    QueryParams,
    QueryArgsParams,
    SourceParams,
    GroupIdentifier,
    FromObjectGroupIdentifier,
    FromObjectState,
    FromObjectResourceParams,
    ParamsYielded,
    MethodYielded,
    LoaderYielded,
    StreamYielded
  > & { providers?: readonly Provider[] },
  ...insertions: any[]
): QueryOutput<
  StripCraftException<QueryState>,
  StripCraftException<QueryParams>,
  QueryArgsParams,
  StripCraftException<QueryParams>,
  GroupIdentifier,
  {},
  ResourceExceptionConstraints,
  {},
  false,
  MethodYielded
> {
  const insertionSnapshotRegistry = new InsertionSnapshotRegistry();
  const queryExtraProviders = [
    {
      provide: INSERTION_SNAPSHOT_REGISTRY,
      useValue: insertionSnapshotRegistry,
    },
    ...(queryConfig.providers ?? []),
  ];
  let injector: Injector | undefined;
  if (
    [
      queryConfig.params,
      queryConfig.method,
      queryConfig.loader,
      queryConfig.stream,
      ...insertions,
    ].some((value) => isGeneratorFunction(value))
  ) {
    assertInInjectionContext(query);
    injector = ɵcreateHostTaggedInjector(
      inject(Injector),
      `query:${name}`,
      queryExtraProviders,
    );
  } else {
    // Capture the injector eagerly whenever `query()` is constructed inside an
    // injection context (the normal case: a component field initializer or a
    // craft-service factory). The resource's reactive `params`/`loader`
    // computeds may FIRST run while driven from OUTSIDE an injection context —
    // e.g. a non-blocking route guard awaiting the resource via
    // `craftUntilSettled(...)`, which subscribes outside one. Without an eagerly
    // captured injector, `getInjector()` below would fall back to the (absent)
    // ambient context and throw NG0203.
    //
    // `isInInjectionContext` is not part of @angular/core's public API in this
    // version, so probe by attempting `inject(Injector)` and falling back to the
    // lazy `getInjector()` if `query()` was genuinely constructed out of context.
    try {
      injector = ɵcreateHostTaggedInjector(
        inject(Injector),
        `query:${name}`,
        queryExtraProviders,
      );
    } catch {
      injector = undefined;
    }
  }

  const getInjector = () => {
    if (!injector) {
      assertInInjectionContext(query);
      injector = ɵcreateHostTaggedInjector(
        inject(Injector),
        `query:${name}`,
        queryExtraProviders,
      );
    }

    return injector;
  };

  const hasMethodFn =
    typeof queryConfig.method === 'function' && !isSignal(queryConfig.method);
  const queryResourceParamsFnSignal =
    queryConfig.params ?? signal<QueryParams | undefined>(undefined);

  // Incremented on every explicit call() so the resource request always changes,
  // forcing the loader to re-run even when the method returns the same value or
  // `undefined`. Starts at 0 = "never called" to preserve idle.
  const methodTriggerSeq = signal(0);

  const isConnectedToSource = isSignal(queryConfig.method);
  const isUsingIdentifier = 'identifier' in queryConfig;

  const methodParamsException = signal<AnyCraftException | undefined>(
    undefined,
  );
  const schemaParseExceptions = signal<Record<string, AnyCraftException>>({});
  const configuredSchemas = {
    method: queryConfig.methodSchema as CraftSchema | undefined,
    params: queryConfig.paramsSchema as CraftSchema | undefined,
    loader: queryConfig.loaderSchema as CraftSchema | undefined,
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
    queryConfig.schemaValidationPolicy as SchemaValidationPolicy | undefined,
  );
  const schemaValidation = {
    method: createSchemaValidationRuntime({
      schema: configuredSchemas.method,
      primitive: 'query',
      name,
      policy: schemaPolicy,
      setException: setSchemaException,
    }),
    params: createSchemaValidationRuntime({
      schema: configuredSchemas.params,
      primitive: 'query',
      name,
      policy: schemaPolicy,
      setException: setSchemaException,
    }),
    loader: createSchemaValidationRuntime({
      schema: configuredSchemas.loader,
      primitive: 'query',
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
    if (
      !isUsingIdentifier ||
      !('identifier' in queryConfig) ||
      !queryConfig.identifier
    ) {
      return undefined;
    }

    if (params === undefined || params === null) {
      return undefined;
    }

    return queryConfig.identifier(params as any) as string;
  };

  const sanitizeParamsResult = (value: QueryParams | undefined) => {
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
      return enrichResourceException(schemaParamsException, { scope: 'params' });
    }

    if (isConnectedToSource && queryConfig.method) {
      const sourceValue = (
        queryConfig.method as unknown as Signal<QueryParams | undefined>
      )();
      return isCraftException(sourceValue)
        ? enrichResourceException(sourceValue, { scope: 'params' })
        : undefined;
    }

    if (
      'params' in queryConfig &&
      queryConfig.params &&
      !('fromResourceById' in queryConfig && queryConfig.fromResourceById)
    ) {
      const paramsValue = executeGeneratorCompatibleFactory({
        factory: queryConfig.params as () => QueryParams,
        thisArg: undefined,
        getInjector,
        args: [],
        invalidYieldErrorMessage: QUERY_INVALID_YIELD_ERROR_MESSAGE,
        multipleAppStartErrorMessage: QUERY_APP_START_ERROR_MESSAGE,
        onAppStartNotSupportedErrorMessage: QUERY_APP_START_ERROR_MESSAGE,
      });
      return isCraftException(paramsValue)
        ? enrichResourceException(paramsValue, { scope: 'params' })
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

  const wrappedParamsFn =
    'params' in queryConfig && queryConfig.params
      ? (((...args: unknown[]) => {
            const value = executeGeneratorCompatibleFactory({
              factory: queryConfig.params as (
                ...args: unknown[]
              ) => QueryParams,
              thisArg: undefined,
              getInjector,
              args,
              invalidYieldErrorMessage: QUERY_INVALID_YIELD_ERROR_MESSAGE,
              multipleAppStartErrorMessage: QUERY_APP_START_ERROR_MESSAGE,
              onAppStartNotSupportedErrorMessage: QUERY_APP_START_ERROR_MESSAGE,
            }) as QueryParams;
            if (!configuredSchemas.params || isCraftException(value)) {
              return sanitizeParamsResult(value);
            }
            const parsed = schemaValidation.params.parseSync<QueryParams>(
              value,
              'params',
              'params',
            );
            return parsed.accepted ? parsed.value : undefined;
          }) as typeof queryConfig.params)
      : undefined;

  const wrappedSourceParams =
    isConnectedToSource && queryConfig.method
      ? ((() =>
          (() => {
            const value = sanitizeParamsResult(
              (
                queryConfig.method as unknown as Signal<QueryParams | undefined>
              )(),
            );
            if (!configuredSchemas.params || isCraftException(value)) {
              return value;
            }
            const parsed = schemaValidation.params.parseSync<QueryParams>(
              value,
              'params',
              'source',
            );
            return parsed.accepted ? parsed.value : undefined;
          })()) as Signal<QueryParams | undefined>)
      : undefined;

  const wrappedLoader =
    'loader' in queryConfig && queryConfig.loader
      ? ((async (param: ResourceLoaderParams<QueryParams>) => {
          const injector = getInjector();
          const correlationSvc = injector.get(CORRELATION_ID_SERVICE, null);
          const operationId = correlationSvc?.lastCorrelationId() ?? null;
          if (operationId) correlationSvc?.startOperation(operationId);

          // Unwrap the method-trigger nonce so the user loader and identifier logic
          // only ever see plain params (no-op for source / params-fn / byId modes).
          const rawParams = unwrapMethodParams(param.params);
          const loaderParam = { ...param, params: rawParams } as typeof param;

          try {
            const step = await executeGeneratorCompatibleFactoryAsync({
              factory: queryConfig.loader as (
                param: ResourceLoaderParams<QueryParams>,
              ) => Promise<QueryState>,
              thisArg: undefined,
              getInjector,
              args: [loaderParam],
              invalidYieldErrorMessage: QUERY_INVALID_YIELD_ERROR_MESSAGE,
              appStartNotSupportedErrorMessage: QUERY_APP_START_ERROR_MESSAGE,
              // Query reloads cancel temporal awaits from the superseded load.
              abortSignal: loaderParam.abortSignal,
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
              return undefined as QueryState;
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
              return undefined as QueryState;
            }

            let validatedResult = result as QueryState;
            if (configuredSchemas.loader) {
              const parsed = await schemaValidation.loader.parseAsync<QueryState>(
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
                return undefined as QueryState;
              }
              validatedResult = parsed.value;
            }

            const successId = getIdentifierFromParams(rawParams);
            setLoaderException(undefined, successId);
            return validatedResult;
          } catch (error) {
            if (param.abortSignal.aborted) {
              return undefined as QueryState;
            }
            if (!isCraftException(error)) {
              injector.get(TAKE_APP_SNAPSHOT, null)?.();
            }
            throw error;
          } finally {
            if (operationId) correlationSvc?.endOperation(operationId);
          }
        }) as typeof queryConfig.loader)
      : undefined;

  const wrappedStream =
    'stream' in queryConfig && queryConfig.stream
      ? (((...args: unknown[]) => {
          const result = executeGeneratorCompatibleFactory({
            factory: queryConfig.stream as (...args: unknown[]) => unknown,
            thisArg: undefined,
            getInjector,
            args,
            invalidYieldErrorMessage: QUERY_INVALID_YIELD_ERROR_MESSAGE,
            multipleAppStartErrorMessage: QUERY_APP_START_ERROR_MESSAGE,
            onAppStartNotSupportedErrorMessage: QUERY_APP_START_ERROR_MESSAGE,
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
          if (result && typeof (result as Promise<unknown>).then === 'function') {
            return Promise.resolve(result).then(wrapStreamSignal);
          }
          return wrapStreamSignal(result);
        }) as typeof queryConfig.stream)
      : undefined;

  const resourceParamsSrc = isConnectedToSource
    ? (wrappedSourceParams as typeof queryConfig.method)
    : (wrappedParamsFn ?? queryResourceParamsFnSignal);

  // Method-based, non-grouped: feed the resource a nonce-tagged request so every
  // explicit call() re-runs the loader (even for identical / `undefined` params),
  // while `resourceParamsSrc` stays the raw signal for all public consumers.
  const methodTaggedParams = computed(() => {
    const seq = methodTriggerSeq();
    if (seq === 0) return undefined; // idle until the first call
    // In method mode this is always the plain signal (no params fn), but its union
    // type includes the fromResourceById params function — narrow with a cast.
    return wrapMethodParams(
      (queryResourceParamsFnSignal as Signal<QueryParams | undefined>)(),
      seq,
    );
  });
  const nonGroupedParams = hasMethodFn
    ? (methodTaggedParams as unknown as typeof resourceParamsSrc)
    : resourceParamsSrc;
  const nonGroupedEqual = hasMethodFn
    ? methodParamsWrapperEqual(
        (queryConfig as { equal?: (a: any, b: any) => boolean }).equal,
      )
    : (queryConfig as { equal?: (a: any, b: any) => boolean }).equal;

  const resourceTarget = isUsingIdentifier
    ? resourceById<
        QueryState,
        QueryParams,
        GroupIdentifier & string,
        string,
        unknown,
        unknown
      >({
        ...queryConfig,
        params: resourceParamsSrc,
        loader: wrappedLoader,
        stream: wrappedStream,
        identifier: queryConfig.identifier,
        equalParams: queryConfig.equalParams ?? 'useIdentifier',
      } as any)
    : !queryConfig.preservePreviousValue || queryConfig.preservePreviousValue()
      ? preservedResource<QueryState, QueryParams>({
          ...queryConfig,
          params: nonGroupedParams,
          equal: nonGroupedEqual,
          loader: wrappedLoader,
          stream: wrappedStream,
        } as ResourceOptions<any, any>)
      : craftResource<QueryState, QueryParams>({
          ...queryConfig,
          params: nonGroupedParams,
          equal: nonGroupedEqual,
          loader: wrappedLoader,
        stream: wrappedStream,
      } as ResourceOptions<any, any>);

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
            'query',
            resourceTarget as any,
          )
        : ɵcreatePrimitiveResourceRuntimeContext(
            'query',
            resourceTarget as any,
          ),
    ),
  );

  // Capture the raw Angular status BEFORE `Object.assign` overrides
  // `resourceTarget.status` with the craft computed below (otherwise the craft
  // status computed would read itself and form a computation cycle).
  // (`as unknown` because the raw Angular ref view — `error` included — is no
  // longer part of the CraftResourceRef surface.)
  const rawResourceStatus = (
    resourceTarget as unknown as ResourceRef<QueryState>
  ).status;
  const publicExceptions = hasConfiguredSchema
    ? computed(() => ({ ...exceptions(), parse: schemaParse() }))
    : exceptions;

  const queryOutputWithoutInsertions = Object.assign(
    resourceTarget,
    // byId is used to helps TS to correctly infer the resourceByGroup
    isUsingIdentifier
      ? {
          /**
           * Only added to help TS inference (TS cannot infer ResourceByIdHandler without erasing the signal getter, () => ResourceByIdRef<...>) )
           */
          _resourceById: resourceTarget as ResourceByIdRef<
            GroupIdentifier & string,
            QueryState,
            QueryParams
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
                  QueryState,
                  QueryParams
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
                  ? computed(() => ({ ...selectExceptions(), parse: schemaParse() }))
                  : selectExceptions,
              });
            })();
          },
          selectOrCreate: (id: GroupIdentifier) => {
            const selected = (
              resourceTarget as ResourceByIdRef<
                GroupIdentifier & string,
                QueryState,
                QueryParams
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
                ? computed(() => ({ ...selectExceptions(), parse: schemaParse() }))
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
      resourceParamsSrc: resourceParamsSrc as WritableSignal<
        QueryParams | undefined
      >,
      call: !hasMethodFn
        ? undefined
        : (arg: QueryArgsParams) => {
            let methodArg: unknown = arg;
            if (configuredSchemas.method) {
              const parsedMethod = schemaValidation.method.parseSync<unknown>(
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
                return yieldableInvocation<MethodYielded, QueryParams>(
                  parsedMethod.exception as QueryParams,
                );
              }
              methodArg = parsedMethod.value;
            }
            const result = executeGeneratorCompatibleFactory({
              factory: queryConfig.method as unknown as (
                args: QueryArgsParams,
              ) => QueryParams,
              thisArg: undefined,
              getInjector,
              args: [methodArg as QueryArgsParams],
              invalidYieldErrorMessage: QUERY_INVALID_YIELD_ERROR_MESSAGE,
              multipleAppStartErrorMessage: QUERY_APP_START_ERROR_MESSAGE,
              onAppStartNotSupportedErrorMessage: QUERY_APP_START_ERROR_MESSAGE,
            });

            if (isCraftException(result)) {
              methodParamsException.set(
                enrichResourceException(result, { scope: 'params' }),
              );
              return yieldableInvocation<MethodYielded, QueryParams>(
                result as QueryParams,
              );
            }

            let paramsResult = result as QueryParams;
            if (configuredSchemas.params) {
              const parsedParams = schemaValidation.params.parseSync<QueryParams>(
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
                return yieldableInvocation<MethodYielded, QueryParams>(
                  parsedParams.exception as QueryParams,
                );
              }
              paramsResult = parsedParams.value;
            }

            if (methodParamsException()) {
              methodParamsException.set(undefined);
            }

            if (isUsingIdentifier) {
              const id = queryConfig.identifier?.(paramsResult as any);
              (
                resourceTarget as ResourceByIdRef<
                  GroupIdentifier & string,
                  QueryState,
                  QueryParams
                >
              ).addById(id as GroupIdentifier & string);
            }
            // Bump before the set so both writes land in the same tick and the
            // resource request changes on every call.
            methodTriggerSeq.update((n) => n + 1);
            //@ts-expect-error if method is exposed params can not be of type (entity: ResourceRef<NoInfer<FromObjectState>>) => QueryParams
            queryResourceParamsFnSignal.set(paramsResult as QueryParams);
            return yieldableInvocation<MethodYielded, QueryParams>(paramsResult);
          },
    },
  );

  const insertionsResult = (
    insertions as InsertionsResourcesFactory<
      NoInfer<GroupIdentifier>,
      NoInfer<StripCraftException<QueryState>>,
      NoInfer<StripCraftException<QueryParams>>,
      ResourceExceptionConstraints,
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
              ? {
                  resourceById: resourceTarget,
                  identifier: queryConfig.identifier,
                }
              : { resource: resourceTarget }),
            resourceParamsSrc: resourceParamsSrc as WritableSignal<
              NoInfer<QueryParams>
            >,
            hasException,
            exceptions,
            insertions: acc as {},
            state: resourceTarget.state,
            set: resourceTarget.set,
            update: resourceTarget.update,
            patch: (patchFn: (currentState: any) => Partial<any>) =>
              resourceTarget.update((current: any) => ({
                ...current,
                ...patchFn(current),
              })),
          } as any,
        ],
        invalidYieldErrorMessage: QUERY_INVALID_YIELD_ERROR_MESSAGE,
        multipleAppStartErrorMessage: QUERY_APP_START_ERROR_MESSAGE,
        onAppStartNotSupportedErrorMessage: QUERY_APP_START_ERROR_MESSAGE,
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
                  'query',
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
              invalidYieldErrorMessage: QUERY_INVALID_YIELD_ERROR_MESSAGE,
              multipleAppStartErrorMessage: QUERY_APP_START_ERROR_MESSAGE,
              onAppStartNotSupportedErrorMessage:
                QUERY_APP_START_ERROR_MESSAGE,
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

  const destroyRefQuery = injector
    ? injector.get(DestroyRef, null)
    : (() => {
        try {
          return inject(DestroyRef, { optional: true });
        } catch {
          return null;
        }
      })();

  if (snapshotRegistry && destroyRefQuery) {
    snapshotRegistry.triggerSnapshot$
      .pipe(takeUntilDestroyed(destroyRefQuery))
      .subscribe(() => {
        const insertionSnapshots = triggerAndCollectInsertions(
          insertionSnapshotRegistry,
        );
        let stateSnapshot: unknown;
        try {
          if (isUsingIdentifier) {
            const byId = (resourceTarget as any)();
            stateSnapshot = {
              params: (resourceParamsSrc as any)?.(),
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
            const resourceState = (resourceTarget as any).state();
            stateSnapshot = {
              params: (resourceParamsSrc as any)?.(),
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
          source: 'query',
          from: hostTagList,
          state: stateSnapshot,
        });
      });
  }

  return Object.assign(
    queryOutputWithoutInsertions,
    insertionsResult,
  ) as unknown as QueryOutput<
    StripCraftException<QueryState>,
    StripCraftException<QueryParams>,
    QueryArgsParams,
    StripCraftException<QueryParams>,
    GroupIdentifier,
    {},
    ResourceExceptionConstraints
  >;
}
