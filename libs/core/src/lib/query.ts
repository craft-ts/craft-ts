import {
  computed,
  isSignal,
  resource,
  ResourceLoaderParams,
  ResourceOptions,
  ResourceRef,
  ResourceStreamingLoader,
  signal,
  WritableSignal,
} from '@angular/core';
import { InsertionsResourcesFactory } from './query.core';
import { resourceById, ResourceByIdRef } from './resource-by-id';
import { AsyncMethodRef } from './craft-async-methods';
import { ReadonlySource } from './util/source.type';
// todo refactor to share code with AsyncMethod

type QueryConfig<
  ResourceState,
  Params,
  ParamsArgs,
  SourceParams,
  GroupIdentifier,
  FromObjectGroupIdentifier extends string,
  FromObjectState,
  FromObjectResourceParams,
> = Omit<ResourceOptions<NoInfer<ResourceState>, Params>, 'params' | 'loader'> &
  (
    | {
        /**
         * A reactive function which determines the request to be made. Whenever the request changes, the
         * loader will be triggered to fetch a new value for the resource.
         *
         * If a request function isn't provided, the loader won't rerun unless the resource is reloaded.
         */
        params: () => Params;
        loader: (
          param: NoInfer<ResourceLoaderParams<Params>>,
        ) => Promise<ResourceState>;
        method?: never;
        fromResourceById?: never;
        stream?: never;
        /**
         * Each the query load, the value will return undefined.
         * To avoid flickering display and also enable to the data to be retrieved from cache, use () => true
         * default value: false
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
        method: ((args: ParamsArgs) => Params) | ReadonlySource<SourceParams>;
        loader: (
          param: NoInfer<ResourceLoaderParams<Params>>,
        ) => Promise<ResourceState>;
        params?: never;
        fromResourceById?: never;
        stream?: never;
        preservePreviousValue?: () => boolean;
      }
    | {
        method?: never;
        loader?: never;
        params?: () => Params;
        fromResourceById?: never;
        /**
         * Loading function which returns a `Promise` of a signal of the resource's value for a given
         * request, which can change over time as new values are received from a stream.
         */
        stream: ResourceStreamingLoader<ResourceState, Params>;
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
        params: (entity: ResourceRef<NoInfer<FromObjectState>>) => Params;
        loader: (
          param: NoInfer<ResourceLoaderParams<Params>>,
        ) => Promise<ResourceState>;
        method?: never;
        stream?: never;
        /**
         * Each the query load, the value will return undefined.
         * To avoid flickering display and also enable to the data to be retrieved from cache, use () => true
         * default value: false
         */
        preservePreviousValue?: () => boolean;
      }
    | {
        method?: never;
        loader?: never;
        params?: () => Params;
        fromResourceById?: never;
        /**
         * Loading function which returns a `Promise` of a signal of the resource's value for a given
         * request, which can change over time as new values are received from a stream.
         */
        stream: ResourceStreamingLoader<ResourceState, Params>;
        preservePreviousValue?: () => boolean;
      }
  ) & {
    /**
     * A unique identifier for the resource, derived from the params.
     * It should be a string that uniquely identifies the resource based on the params.
     */
    identifier?: (params: NoInfer<NonNullable<Params>>) => GroupIdentifier;
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
     * For **queries** the default value is 'useIdentifier'
     *
     * For **querys** the default value is 'default'
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

export type QueryRef<
  Value,
  ArgParams,
  Params,
  Insertions,
  IsMethod,
  SourceParams,
  GroupIdentifier,
> = AsyncMethodRef<
  Value,
  ArgParams,
  Params,
  Insertions,
  IsMethod,
  SourceParams,
  GroupIdentifier
>;

export type QueryOutput<
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
  [unknown] extends [Params] ? false : true,
  SourceParams,
  GroupIdentifier
> & {
  resourceParamsSrc: WritableSignal<Params | undefined>;
  reload(): boolean;
};

export function query<
  QueryState extends object | undefined,
  QueryParams,
  QueryArgsParams,
  SourceParams,
  GroupIdentifier,
  FromObjectGroupIdentifier extends string,
  FromObjectState,
  FromObjectResourceParams,
>(
  queryConfig: QueryConfig<
    QueryState,
    QueryParams,
    QueryArgsParams,
    SourceParams,
    GroupIdentifier,
    FromObjectGroupIdentifier,
    FromObjectState,
    FromObjectResourceParams
  >,
): QueryOutput<
  QueryState,
  QueryParams,
  QueryArgsParams,
  SourceParams,
  GroupIdentifier,
  {}
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
>(
  queryConfig: QueryConfig<
    QueryState,
    QueryParams,
    QueryArgsParams,
    SourceParams,
    GroupIdentifier,
    FromObjectGroupIdentifier,
    FromObjectState,
    FromObjectResourceParams
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion1
  >,
): QueryOutput<
  QueryState,
  QueryParams,
  QueryArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1
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
>(
  queryConfig: QueryConfig<
    QueryState,
    QueryParams,
    QueryArgsParams,
    SourceParams,
    GroupIdentifier,
    FromObjectGroupIdentifier,
    FromObjectState,
    FromObjectResourceParams
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion2,
    Insertion1
  >,
): QueryOutput<
  QueryState,
  QueryParams,
  QueryArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2
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
>(
  queryConfig: QueryConfig<
    QueryState,
    QueryParams,
    QueryArgsParams,
    SourceParams,
    GroupIdentifier,
    FromObjectGroupIdentifier,
    FromObjectState,
    FromObjectResourceParams
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion3,
    Insertion1 & Insertion2
  >,
): QueryOutput<
  QueryState,
  QueryParams,
  QueryArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3
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
>(
  queryConfig: QueryConfig<
    QueryState,
    QueryParams,
    QueryArgsParams,
    SourceParams,
    GroupIdentifier,
    FromObjectGroupIdentifier,
    FromObjectState,
    FromObjectResourceParams
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
): QueryOutput<
  QueryState,
  QueryParams,
  QueryArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4
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
>(
  queryConfig: QueryConfig<
    QueryState,
    QueryParams,
    QueryArgsParams,
    SourceParams,
    GroupIdentifier,
    FromObjectGroupIdentifier,
    FromObjectState,
    FromObjectResourceParams
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
): QueryOutput<
  QueryState,
  QueryParams,
  QueryArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
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
>(
  queryConfig: QueryConfig<
    QueryState,
    QueryParams,
    QueryArgsParams,
    SourceParams,
    GroupIdentifier,
    FromObjectGroupIdentifier,
    FromObjectState,
    FromObjectResourceParams
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
  insertion6: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
  >,
): QueryOutput<
  QueryState,
  QueryParams,
  QueryArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6
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
>(
  queryConfig: QueryConfig<
    QueryState,
    QueryParams,
    QueryArgsParams,
    SourceParams,
    GroupIdentifier,
    FromObjectGroupIdentifier,
    FromObjectState,
    FromObjectResourceParams
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
  insertion6: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
  >,
  insertion7: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<QueryState>,
    NoInfer<QueryParams>,
    Insertion7,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6
  >,
): QueryOutput<
  QueryState,
  QueryParams,
  QueryArgsParams,
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
export function query<
  QueryState extends object | undefined,
  QueryParams,
  QueryArgsParams,
  SourceParams,
  GroupIdentifier,
  FromObjectGroupIdentifier extends string,
  FromObjectState,
  FromObjectResourceParams,
>(
  queryConfig: QueryConfig<
    QueryState,
    QueryParams,
    QueryArgsParams,
    SourceParams,
    GroupIdentifier,
    FromObjectGroupIdentifier,
    FromObjectState,
    FromObjectResourceParams
  >,
  ...insertions: any[]
): QueryOutput<
  QueryState,
  QueryParams,
  QueryArgsParams,
  SourceParams,
  GroupIdentifier,
  {}
> {
  const hasParamsFn = typeof queryConfig.method === 'function';
  const queryResourceParamsFnSignal =
    queryConfig.params ?? signal<QueryParams | undefined>(undefined);

  const isConnectedToSource = isSignal(queryConfig.method);
  const isUsingIdentifier = 'identifier' in queryConfig;

  const resourceParamsSrc = isConnectedToSource
    ? queryConfig.method
    : queryResourceParamsFnSignal;

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
        identifier: queryConfig.identifier,
      } as any)
    : resource<QueryState, QueryParams>({
        ...queryConfig,
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
            QueryState,
            QueryParams
          >,
          select: (id: GroupIdentifier) => {
            return computed(() => {
              const list = (
                resourceTarget as ResourceByIdRef<
                  GroupIdentifier & string,
                  QueryState,
                  QueryParams
                >
              )();
              //@ts-expect-error GroupIdentifier & string is not recognized correctly
              return list[id];
            })();
          },
        }
      : {},
    {
      resourceParamsSrc: resourceParamsSrc as WritableSignal<
        QueryParams | undefined
      >,
      method:
        hasParamsFn || isSignal(queryConfig.method)
          ? undefined
          : (arg: QueryArgsParams) => {
              const result = (
                queryConfig.method as unknown as (
                  args: QueryArgsParams,
                ) => QueryParams
              )(arg);
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
    (
      insertions as InsertionsResourcesFactory<
        NoInfer<GroupIdentifier>,
        NoInfer<QueryState>,
        NoInfer<QueryParams>,
        {}
      >[]
    )?.reduce(
      (acc, insert) => {
        return {
          ...acc,
          ...insert({
            ...(isUsingIdentifier
              ? {
                  resourceById: resourceTarget,
                  identifier: queryConfig.identifier,
                }
              : { resource: resourceTarget }),
            resourceParamsSrc: resourceParamsSrc as WritableSignal<
              NoInfer<QueryParams>
            >,
            insertions: acc as {},
          } as any), // try to improve the type here
        };
      },
      {} as Record<string, unknown>,
    ),
  ) as unknown as QueryOutput<
    QueryState,
    QueryParams,
    QueryArgsParams,
    SourceParams,
    GroupIdentifier,
    {}
  >;
}
