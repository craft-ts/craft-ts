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
  isGenerator,
  isGeneratorFunction,
  runCraftGenerator,
} from './craft-generator-runtime';
import { resourceById, ResourceByIdRef } from './resource-by-id';
import { ReadonlySource } from './util/source.type';
import {
  CraftResourceStatus,
  toCraftStatus,
} from './util/craft-resource-status';
import { MergeObjects } from './util/util.type';
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
  APP_SNAPSHOT_REGISTRY,
  INSERTION_SNAPSHOT_REGISTRY,
  InsertionSnapshotRegistry,
  TAKE_APP_SNAPSHOT,
  triggerAndCollectInsertions,
} from './take-app-snapshot';
import type {
  BrandedServiceProvider,
  SERVICE_HELPER_DEPENDENCIES,
  ServiceDependencyMapFromYielded,
} from './craft-service';
import { ɵcreateHostTaggedInjector, ɵHOST_TAG_LIST } from './craft-service';
import { injectFnWrapper } from './fn-wrapper';
import { ɵprovidePrimitiveMethodRuntimeContext } from './primitive-method-runtime-context';
import {
  ɵcreatePrimitiveResourceByIdRuntimeContext,
  ɵcreatePrimitiveResourceRuntimeContext,
  ɵobservePrimitiveResourceRuntimeContext,
} from './primitive-resource-runtime-context';

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
> = [QueryConfigProviderNames<Providers>] extends [never]
  ? ServiceDependencyMapFromYielded<
      | ParamsYielded
      | MethodYielded
      | LoaderYielded
      | StreamYielded
      | InsertionsYielded
    >
  : SatisfyDependencies<
      ServiceDependencyMapFromYielded<
        | ParamsYielded
        | MethodYielded
        | LoaderYielded
        | StreamYielded
        | InsertionsYielded
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
  }>;
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
  }>;
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
> = {
  type: 'resourceLike';
  kind: 'query';
} & MergeObjects<
  [
    {
      readonly value: Signal<Value | undefined>;
      /**
       * Avoids to throw error when accessing value during error state
       */
      readonly safeValue: Signal<Value | undefined>;
      readonly status: Signal<CraftResourceStatus>;
      readonly isLoading: Signal<boolean>;
      hasValue(): boolean;
    },
    {
      readonly resourceParamsSrc: WritableSignal<NoInfer<Params>>;
    },
    IsMethod extends true
      ? {
          call: (args: ArgParams) => Params;
        }
      : {
          source: ReadonlySource<SourceParams>;
        },
    Insertions,
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
> = { type: 'resourceByGroupLike'; kind: 'query' } & {
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
        /**
         * Avoids to throw error when accessing value during error state
         */
        readonly safeValue: Signal<Value | undefined>;
        readonly status: Signal<CraftResourceStatus>;
        readonly isLoading: Signal<boolean>;
        hasValue(): boolean;
      } & ResourceLikeExceptions<QueryException, GroupIdentifier>) // todo exception params should be display outside
    | undefined;
} & MergeObjects<
    [
      Insertions,
      IsMethod extends true
        ? {
            call: (args: ArgParams) => Params;
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
> = [unknown] extends [GroupIdentifier]
  ? ResourceLikeQueryRef<
      Value,
      Params,
      IsMethod,
      ArgParams,
      SourceParams,
      Insertions,
      QueryExceptions,
      Dependencies
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
      Dependencies
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
> = QueryRef<
  State,
  Params,
  ArgParams,
  Insertions,
  [unknown] extends [ArgParams] ? false : true, // ! force to method to have one arg minimum, we can not compare SourceParams type, because it also infer Params
  SourceParams,
  GroupIdentifier,
  QueryExceptions,
  Dependencies
>;

export function query<
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
    loader: ExtractCraftException<QueryState>;
  },
>(
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
): QueryOutput<
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
  >
>;
export function query<
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
    loader: ExtractCraftException<QueryState>;
  },
>(
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
    Exceptions,
    Insertion1,
    {},
    Insertion1Yielded
  >,
): QueryOutput<
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
    Providers
  >
>;
export function query<
  QueryState extends object | undefined,
  QueryParams,
  QueryArgsParams,
  SourceParams,
  GroupIdentifier,
  FromObjectGroupIdentifier extends string,
  FromObjectState,
  FromObjectResourceParams,
  Insertion1,
  Insertion2,
  ParamsYielded = never,
  MethodYielded = never,
  LoaderYielded = never,
  StreamYielded = never,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Config = {},
  Providers extends readonly Provider[] = Config extends {
    readonly providers: infer P extends readonly Provider[];
  }
    ? P
    : never[],
  Exceptions extends ResourceExceptionConstraints = {
    params: ExtractCraftException<QueryParams>;
    loader: ExtractCraftException<QueryState>;
  },
>(
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
    Exceptions,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<QueryState>>,
    NoInfer<StripCraftException<QueryParams>>,
    Exceptions,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
): QueryOutput<
  StripCraftException<QueryState>,
  StripCraftException<QueryParams>,
  QueryArgsParams,
  StripCraftException<QueryParams>,
  GroupIdentifier,
  Insertion1 & Insertion2,
  Exceptions,
  QueryTrackedDependencies<
    ParamsYielded,
    MethodYielded,
    LoaderYielded,
    StreamYielded,
    Insertion1Yielded | Insertion2Yielded,
    Providers
  >
>;
export function query<
  QueryState extends object | undefined,
  QueryParams,
  QueryArgsParams,
  SourceParams,
  GroupIdentifier,
  FromObjectGroupIdentifier extends string,
  FromObjectState,
  FromObjectResourceParams,
  Insertion1,
  Insertion2,
  Insertion3,
  ParamsYielded = never,
  MethodYielded = never,
  LoaderYielded = never,
  StreamYielded = never,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Config = {},
  Providers extends readonly Provider[] = Config extends {
    readonly providers: infer P extends readonly Provider[];
  }
    ? P
    : never[],
  Exceptions extends ResourceExceptionConstraints = {
    params: ExtractCraftException<QueryParams>;
    loader: ExtractCraftException<QueryState>;
  },
>(
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
    Exceptions,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<QueryState>>,
    NoInfer<StripCraftException<QueryParams>>,
    Exceptions,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<QueryState>>,
    NoInfer<StripCraftException<QueryParams>>,
    Exceptions,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
): QueryOutput<
  StripCraftException<QueryState>,
  StripCraftException<QueryParams>,
  QueryArgsParams,
  StripCraftException<QueryParams>,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3,
  Exceptions,
  QueryTrackedDependencies<
    ParamsYielded,
    MethodYielded,
    LoaderYielded,
    StreamYielded,
    Insertion1Yielded | Insertion2Yielded | Insertion3Yielded,
    Providers
  >
>;
export function query<
  QueryState extends object | undefined,
  QueryParams,
  QueryArgsParams,
  SourceParams,
  GroupIdentifier,
  FromObjectGroupIdentifier extends string,
  FromObjectState,
  FromObjectResourceParams,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  ParamsYielded = never,
  MethodYielded = never,
  LoaderYielded = never,
  StreamYielded = never,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
  Config = {},
  Providers extends readonly Provider[] = Config extends {
    readonly providers: infer P extends readonly Provider[];
  }
    ? P
    : never[],
  Exceptions extends ResourceExceptionConstraints = {
    params: ExtractCraftException<QueryParams>;
    loader: ExtractCraftException<QueryState>;
  },
>(
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
    Exceptions,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<QueryState>>,
    NoInfer<StripCraftException<QueryParams>>,
    Exceptions,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<QueryState>>,
    NoInfer<StripCraftException<QueryParams>>,
    Exceptions,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<QueryState>>,
    NoInfer<StripCraftException<QueryParams>>,
    Exceptions,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
): QueryOutput<
  StripCraftException<QueryState>,
  StripCraftException<QueryParams>,
  QueryArgsParams,
  StripCraftException<QueryParams>,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4,
  Exceptions,
  QueryTrackedDependencies<
    ParamsYielded,
    MethodYielded,
    LoaderYielded,
    StreamYielded,
    | Insertion1Yielded
    | Insertion2Yielded
    | Insertion3Yielded
    | Insertion4Yielded,
    Providers
  >
>;
export function query<
  QueryState extends object | undefined,
  QueryParams,
  QueryArgsParams,
  SourceParams,
  GroupIdentifier,
  FromObjectGroupIdentifier extends string,
  FromObjectState,
  FromObjectResourceParams,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  ParamsYielded = never,
  MethodYielded = never,
  LoaderYielded = never,
  StreamYielded = never,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
  Insertion5Yielded = never,
  Config = {},
  Providers extends readonly Provider[] = Config extends {
    readonly providers: infer P extends readonly Provider[];
  }
    ? P
    : never[],
  Exceptions extends ResourceExceptionConstraints = {
    params: ExtractCraftException<QueryParams>;
    loader: ExtractCraftException<QueryState>;
  },
>(
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
    Exceptions,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<QueryState>>,
    NoInfer<StripCraftException<QueryParams>>,
    Exceptions,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<QueryState>>,
    NoInfer<StripCraftException<QueryParams>>,
    Exceptions,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<QueryState>>,
    NoInfer<StripCraftException<QueryParams>>,
    Exceptions,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
  insertion5: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<QueryState>>,
    NoInfer<StripCraftException<QueryParams>>,
    Exceptions,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4,
    Insertion5Yielded
  >,
): QueryOutput<
  StripCraftException<QueryState>,
  StripCraftException<QueryParams>,
  QueryArgsParams,
  StripCraftException<QueryParams>,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
  Exceptions,
  QueryTrackedDependencies<
    ParamsYielded,
    MethodYielded,
    LoaderYielded,
    StreamYielded,
    | Insertion1Yielded
    | Insertion2Yielded
    | Insertion3Yielded
    | Insertion4Yielded
    | Insertion5Yielded,
    Providers
  >
>;
export function query<
  QueryState extends object | undefined,
  QueryParams,
  QueryArgsParams,
  SourceParams,
  GroupIdentifier,
  FromObjectGroupIdentifier extends string,
  FromObjectState,
  FromObjectResourceParams,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  ParamsYielded = never,
  MethodYielded = never,
  LoaderYielded = never,
  StreamYielded = never,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
  Insertion5Yielded = never,
  Insertion6Yielded = never,
  Config = {},
  Providers extends readonly Provider[] = Config extends {
    readonly providers: infer P extends readonly Provider[];
  }
    ? P
    : never[],
  Exceptions extends ResourceExceptionConstraints = {
    params: ExtractCraftException<QueryParams>;
    loader: ExtractCraftException<QueryState>;
  },
>(
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
    Exceptions,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<QueryState>>,
    NoInfer<StripCraftException<QueryParams>>,
    Exceptions,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<QueryState>>,
    NoInfer<StripCraftException<QueryParams>>,
    Exceptions,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<QueryState>>,
    NoInfer<StripCraftException<QueryParams>>,
    Exceptions,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
  insertion5: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<QueryState>>,
    NoInfer<StripCraftException<QueryParams>>,
    Exceptions,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4,
    Insertion5Yielded
  >,
  insertion6: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<QueryState>>,
    NoInfer<StripCraftException<QueryParams>>,
    Exceptions,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
    Insertion6Yielded
  >,
): QueryOutput<
  StripCraftException<QueryState>,
  StripCraftException<QueryParams>,
  QueryArgsParams,
  StripCraftException<QueryParams>,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6,
  Exceptions,
  QueryTrackedDependencies<
    ParamsYielded,
    MethodYielded,
    LoaderYielded,
    StreamYielded,
    | Insertion1Yielded
    | Insertion2Yielded
    | Insertion3Yielded
    | Insertion4Yielded
    | Insertion5Yielded
    | Insertion6Yielded,
    Providers
  >
>;
export function query<
  QueryState extends object | undefined,
  QueryParams,
  QueryArgsParams,
  SourceParams,
  GroupIdentifier,
  FromObjectGroupIdentifier extends string,
  FromObjectState,
  FromObjectResourceParams,
  Insertion1,
  Insertion2,
  Insertion3,
  Insertion4,
  Insertion5,
  Insertion6,
  Insertion7,
  ParamsYielded = never,
  MethodYielded = never,
  LoaderYielded = never,
  StreamYielded = never,
  Insertion1Yielded = never,
  Insertion2Yielded = never,
  Insertion3Yielded = never,
  Insertion4Yielded = never,
  Insertion5Yielded = never,
  Insertion6Yielded = never,
  Insertion7Yielded = never,
  Config = {},
  Providers extends readonly Provider[] = Config extends {
    readonly providers: infer P extends readonly Provider[];
  }
    ? P
    : never[],
  Exceptions extends ResourceExceptionConstraints = {
    params: ExtractCraftException<QueryParams>;
    loader: ExtractCraftException<QueryState>;
  },
>(
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
    Exceptions,
    Insertion1,
    {},
    Insertion1Yielded
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<QueryState>>,
    NoInfer<StripCraftException<QueryParams>>,
    Exceptions,
    Insertion2,
    Insertion1,
    Insertion2Yielded
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<QueryState>>,
    NoInfer<StripCraftException<QueryParams>>,
    Exceptions,
    Insertion3,
    Insertion1 & Insertion2,
    Insertion3Yielded
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<QueryState>>,
    NoInfer<StripCraftException<QueryParams>>,
    Exceptions,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3,
    Insertion4Yielded
  >,
  insertion5: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<QueryState>>,
    NoInfer<StripCraftException<QueryParams>>,
    Exceptions,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4,
    Insertion5Yielded
  >,
  insertion6: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<QueryState>>,
    NoInfer<StripCraftException<QueryParams>>,
    Exceptions,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5,
    Insertion6Yielded
  >,
  insertion7: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<StripCraftException<QueryState>>,
    NoInfer<StripCraftException<QueryParams>>,
    Exceptions,
    Insertion7,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6,
    Insertion7Yielded
  >,
): QueryOutput<
  StripCraftException<QueryState>,
  StripCraftException<QueryParams>,
  QueryArgsParams,
  StripCraftException<QueryParams>,
  GroupIdentifier,
  Insertion1 &
    Insertion2 &
    Insertion3 &
    Insertion4 &
    Insertion5 &
    Insertion6 &
    Insertion7,
  Exceptions,
  QueryTrackedDependencies<
    ParamsYielded,
    MethodYielded,
    LoaderYielded,
    StreamYielded,
    | Insertion1Yielded
    | Insertion2Yielded
    | Insertion3Yielded
    | Insertion4Yielded
    | Insertion5Yielded
    | Insertion6Yielded
    | Insertion7Yielded,
    Providers
  >
>;
/**
 * Creates a reactive query manager that handles data fetching with automatic state tracking.
 *
 * This function manages query state by:
 * - Executing asynchronous fetch operations (loader or stream) automatically when params change
 * - Tracking operation status (idle, loading, resolved, rejected)
 * - Providing reactive signals for value, status, error, and loading state
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
 *
 * **Caching & Performance:**
 * - Use `preservePreviousValue: () => true` to prevent flickering by keeping previous data while loading
 * - Use `equalParams` to control when queries should re-execute based on params comparison
 *
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
 * @param insertions - Optional insertion functions to add custom methods, computed values or side effects to the query.
 *   Insertions receive context with resource signals (`value`, `status`, `error`, `isLoading`, `hasValue`), `config`, and previous insertions.
 * @returns A query reference object with:
 *   - `value`: Signal containing the query result (undefined if not yet executed)
 *   - `status`: Signal with current status ('idle' | 'loading' | 'resolved' | 'rejected')
 *   - `error`: Signal containing any error that occurred
 *   - `isLoading`: Signal indicating if the query is currently executing
 *   - `hasValue()`: Method to check if a value is available
 *   - `call(args)`: Method to trigger the query manually (only for method-based queries)
 *   - `source`: The connected source (only for source-based queries)
 *   - `select(id)`: Method to access a specific query instance by ID (only when identifier is provided)
 *   - `resourceParamsSrc`: The underlying params signal
 *   - Custom methods from insertions
 *
 * @example
 * Basic params-based automatic query
 * ```ts
 * const userIdSignal = signal('user-123');
 *
 * const userQuery = query({
 *   params: () => userIdSignal(),
 *   loader: async ({ params }) => {
 *     const response = await fetch(`/api/users/${params}`);
 *     return response.json();
 *   },
 * });
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
 * const searchQuery = query({
 *   method: (searchTerm: string) => ({ term: searchTerm }),
 *   loader: async ({ params }) => {
 *     const response = await fetch(`/api/search?q=${params.term}`);
 *     return response.json();
 *   },
 * });
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
 * const userQuery = query({
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
 * });
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
 * const userDetailsQuery = query({
 *   params: () => currentUserId(),
 *   identifier: (userId) => userId,
 *   loader: async ({ params }) => {
 *     const response = await fetch(`/api/users/${params}`);
 *     return response.json();
 *   },
 * });
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
 * const todosQuery = query(
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
 * );
 *
 * console.log(todosQuery.count()); // Custom computed from insertion
 * console.log(todosQuery.isEmpty()); // true/false
 * ```
 *
 * @example
 * Streaming query
 * ```ts
 * const liveDataQuery = query({
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
 * });
 *
 * // value() updates continuously as stream data arrives
 * ```
 *
 * @example
 * Derived query from another ResourceByIdRef
 * ```ts
 * // First query fetches basic user data
 * const usersQuery = query({
 *   params: () => currentUserId(),
 *   identifier: (userId) => userId,
 *   loader: async ({ params }) => {
 *     const response = await fetch(`/api/users/${params}`);
 *     return response.json();
 *   },
 * });
 *
 * // Derived query enriches user data with additional info
 * const enrichedUsersQuery = query({
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
 * });
 *
 * // Derived query executes automatically when usersQuery resolves
 * const enrichedUser = enrichedUsersQuery.select('user-123');
 * console.log(enrichedUser?.value()); // { ...userData, ...details }
 * ```
 */
export function query<
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
  ResourceExceptionConstraints
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
      'query',
      queryExtraProviders,
    );
  } else {
    // Capture the injector eagerly whenever `query()` is constructed inside an
    // injection context (the normal case: a component field initializer or a
    // craft-service factory). The resource's reactive `params`/`loader`
    // computeds may FIRST run while driven from OUTSIDE an injection context —
    // e.g. a non-blocking route guard awaiting the resource via
    // `untilSettled(...)`, which subscribes outside one. Without an eagerly
    // captured injector, `getInjector()` below would fall back to the (absent)
    // ambient context and throw NG0203.
    //
    // `isInInjectionContext` is not part of @angular/core's public API in this
    // version, so probe by attempting `inject(Injector)` and falling back to the
    // lazy `getInjector()` if `query()` was genuinely constructed out of context.
    try {
      injector = ɵcreateHostTaggedInjector(
        inject(Injector),
        'query',
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
        'query',
        queryExtraProviders,
      );
    }

    return injector;
  };

  const hasMethodFn =
    typeof queryConfig.method === 'function' && !isSignal(queryConfig.method);
  const queryResourceParamsFnSignal =
    queryConfig.params ?? signal<QueryParams | undefined>(undefined);

  const isConnectedToSource = isSignal(queryConfig.method);
  const isUsingIdentifier = 'identifier' in queryConfig;

  const methodParamsException = signal<AnyCraftException | undefined>(
    undefined,
  );

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
      ? (((...args: unknown[]) =>
          sanitizeParamsResult(
            executeGeneratorCompatibleFactory({
              factory: queryConfig.params as (
                ...args: unknown[]
              ) => QueryParams,
              thisArg: undefined,
              getInjector,
              args,
              invalidYieldErrorMessage: QUERY_INVALID_YIELD_ERROR_MESSAGE,
              multipleAppStartErrorMessage: QUERY_APP_START_ERROR_MESSAGE,
              onAppStartNotSupportedErrorMessage: QUERY_APP_START_ERROR_MESSAGE,
            }) as QueryParams,
          )) as typeof queryConfig.params)
      : undefined;

  const wrappedSourceParams =
    isConnectedToSource && queryConfig.method
      ? ((() =>
          sanitizeParamsResult(
            (
              queryConfig.method as unknown as Signal<QueryParams | undefined>
            )(),
          )) as Signal<QueryParams | undefined>)
      : undefined;

  const wrappedLoader =
    'loader' in queryConfig && queryConfig.loader
      ? ((async (param: ResourceLoaderParams<QueryParams>) => {
          const injector = getInjector();
          const correlationSvc = injector.get(CORRELATION_ID_SERVICE, null);
          const operationId = correlationSvc?.lastCorrelationId() ?? null;
          if (operationId) correlationSvc?.startOperation(operationId);

          try {
            const result = await executeGeneratorCompatibleFactory({
              factory: queryConfig.loader as (
                param: ResourceLoaderParams<QueryParams>,
              ) => Promise<QueryState>,
              thisArg: undefined,
              getInjector,
              args: [param],
              invalidYieldErrorMessage: QUERY_INVALID_YIELD_ERROR_MESSAGE,
              multipleAppStartErrorMessage: QUERY_APP_START_ERROR_MESSAGE,
              onAppStartNotSupportedErrorMessage: QUERY_APP_START_ERROR_MESSAGE,
            });

            if (isCraftException(result)) {
              const exceptionId = getIdentifierFromParams(param.params);
              setLoaderException(
                enrichResourceException(result, {
                  scope: 'loader',
                  identifier: exceptionId,
                }),
                exceptionId,
              );
              return undefined as QueryState;
            }

            const successId = getIdentifierFromParams(param.params);
            setLoaderException(undefined, successId);
            return result;
          } catch (error) {
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
      ? (((...args: unknown[]) =>
          executeGeneratorCompatibleFactory({
            factory: queryConfig.stream as (...args: unknown[]) => unknown,
            thisArg: undefined,
            getInjector,
            args,
            invalidYieldErrorMessage: QUERY_INVALID_YIELD_ERROR_MESSAGE,
            multipleAppStartErrorMessage: QUERY_APP_START_ERROR_MESSAGE,
            onAppStartNotSupportedErrorMessage: QUERY_APP_START_ERROR_MESSAGE,
          })) as typeof queryConfig.stream)
      : undefined;

  const resourceParamsSrc = isConnectedToSource
    ? (wrappedSourceParams as typeof queryConfig.method)
    : (wrappedParamsFn ?? queryResourceParamsFnSignal);

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
          params: resourceParamsSrc,
          loader: wrappedLoader,
          stream: wrappedStream,
        } as ResourceOptions<any, any>)
      : craftResource<QueryState, QueryParams>({
          ...queryConfig,
          params: resourceParamsSrc,
          loader: wrappedLoader,
          stream: wrappedStream,
        } as ResourceOptions<any, any>);

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
  const rawResourceStatus = (resourceTarget as ResourceRef<QueryState>).status;

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
                exceptions: selectExceptions,
              });
            })();
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
      exceptions,
      resourceParamsSrc: resourceParamsSrc as WritableSignal<
        QueryParams | undefined
      >,
      call: !hasMethodFn
        ? undefined
        : (arg: QueryArgsParams) => {
            const result = executeGeneratorCompatibleFactory({
              factory: queryConfig.method as unknown as (
                args: QueryArgsParams,
              ) => QueryParams,
              thisArg: undefined,
              getInjector,
              args: [arg],
              invalidYieldErrorMessage: QUERY_INVALID_YIELD_ERROR_MESSAGE,
              multipleAppStartErrorMessage: QUERY_APP_START_ERROR_MESSAGE,
              onAppStartNotSupportedErrorMessage: QUERY_APP_START_ERROR_MESSAGE,
            });

            if (isCraftException(result)) {
              methodParamsException.set(
                enrichResourceException(result, { scope: 'params' }),
              );
              return result as QueryParams;
            }

            if (methodParamsException()) {
              methodParamsException.set(undefined);
            }

            if (isUsingIdentifier) {
              const id = queryConfig.identifier?.(arg as any);
              (
                resourceTarget as ResourceByIdRef<
                  GroupIdentifier & string,
                  QueryState,
                  QueryParams
                >
              ).addById(id as GroupIdentifier & string);
            }
            //@ts-expect-error if method is exposed params can not be of type (entity: ResourceRef<NoInfer<FromObjectState>>) => QueryParams
            queryResourceParamsFnSignal.set(result as QueryParams);
            return result;
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
          if (typeof value === 'function' && !isSignal(value)) {
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
            wrappedAcc[key] = (...args: unknown[]) =>
              runInInjectionContext(methodInjector, () => {
                const result = (wrappedFn as (...a: unknown[]) => unknown)(
                  ...args,
                );
                if (isGenerator(result)) {
                  return runCraftGenerator({
                    iterator: result,
                    injector: methodInjector,
                    hostScope: 'function',
                    invalidYieldErrorMessage: QUERY_INVALID_YIELD_ERROR_MESSAGE,
                    multipleAppStartErrorMessage: QUERY_APP_START_ERROR_MESSAGE,
                    onAppStartNotSupportedErrorMessage:
                      QUERY_APP_START_ERROR_MESSAGE,
                  }).value;
                }
                return result;
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
