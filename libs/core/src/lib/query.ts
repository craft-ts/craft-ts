import {
  computed,
  isSignal,
  resource,
  ResourceLoaderParams,
  ResourceOptions,
  ResourceRef,
  ResourceStatus,
  ResourceStreamingLoader,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { InsertionsResourcesFactory } from './query.core';
import { resourceById, ResourceByIdRef } from './resource-by-id';
import { ReadonlySource } from './util/source.type';
import { MergeObjects } from './util/util.type';

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

export type ResourceLikeQueryRef<
  Value,
  Params,
  IsMethod,
  ArgParams,
  SourceParams,
  Insertions,
> = {
  type: 'resourceLike';
  kind: 'query';
} & MergeObjects<
  [
    {
      readonly value: Signal<Value | undefined>;
      readonly status: Signal<ResourceStatus>;
      readonly error: Signal<Error | undefined>;
      readonly isLoading: Signal<boolean>;
      hasValue(): boolean;
    },
    {
      readonly resourceParamsSrc: WritableSignal<NoInfer<Params>>;
    },
    IsMethod extends true
      ? {
          mutate: (args: ArgParams) => Params;
        }
      : {
          source: ReadonlySource<SourceParams>;
        },
    Insertions,
    {
      [key in `~InternalType`]: 'Used to avoid TS type erasure';
    },
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
    | {
        readonly value: Signal<Value | undefined>;
        readonly status: Signal<ResourceStatus>;
        readonly error: Signal<Error | undefined>;
        readonly isLoading: Signal<boolean>;
        hasValue(): boolean;
      }
    | undefined;
} & MergeObjects<
    [
      Insertions,
      IsMethod extends true
        ? {
            mutate: (args: ArgParams) => Params;
          }
        : {
            source: ReadonlySource<SourceParams>;
          },
      ResourceByIdRef<GroupIdentifier & string, Value, Params>,
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
> = [unknown] extends [GroupIdentifier]
  ? ResourceLikeQueryRef<
      Value,
      Params,
      IsMethod,
      ArgParams,
      SourceParams,
      Insertions
    >
  : ResourceByIdLikeQueryRef<
      Value,
      Params,
      IsMethod,
      ArgParams,
      SourceParams,
      Insertions,
      GroupIdentifier
    >;

export type QueryOutput<
  State extends object | undefined,
  Params,
  ArgParams,
  SourceParams,
  GroupIdentifier,
  Insertions,
> = QueryRef<
  State,
  Params,
  ArgParams,
  Insertions,
  [unknown] extends [ArgParams] ? false : true, // ! force to method to have one arg minimum, we can not compare SourceParams type, because it also infer Params
  SourceParams,
  GroupIdentifier
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
 * - **Method-based (manual):** Define a `method` function that returns params. Call `mutate()` to trigger execution.
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
 *   - `mutate(args)`: Method to trigger the query manually (only for method-based queries)
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
 * searchQuery.mutate('angular');
 * console.log(searchQuery.status()); // 'loading'
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
 * Query with caching to prevent flickering
 * ```ts
 * const postsQuery = query({
 *   params: () => ({ page: currentPage() }),
 *   preservePreviousValue: () => true, // Keep showing old data while loading
 *   loader: async ({ params }) => {
 *     const response = await fetch(`/api/posts?page=${params.page}`);
 *     return response.json();
 *   },
 * });
 *
 * // When page changes, old data remains visible until new data loads
 * // No flickering or empty states during navigation
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
  );

  return Object.assign(
    queryOutputWithoutInsertions,
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
