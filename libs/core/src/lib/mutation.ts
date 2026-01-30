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
// todo refactor to share code with AsyncMethod

type MutationConfig<
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
         * Used to generate a method in the store, when called will trigger the resource loader/stream.
         *
         * ! It required One parameter at least to be able to generate the method (otherwise it will think it is bind to a source, see below).
         *
         * Only support one parameter which can be an object to pass multiple parameters.
         *
         * It also accepts a ReadonlySource<SourceParams> to connect the mutation params to an external signal source.
         */
        method: ((args: ParamsArgs) => Params) | ReadonlySource<SourceParams>;
        fromResourceById?: never;
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
      }
    | {
        /**
         * Used to generate a method in the store, when called will trigger the resource loader/stream.
         *
         * ! It required One parameter at least to be able to generate the method (otherwise it will think it is bind to a source, see below).
         *
         * Only support one parameter which can be an object to pass multiple parameters.
         *
         * It also accepts a ReadonlySource<SourceParams> to connect the mutation params to an external signal source.
         */
        method: ((args: ParamsArgs) => Params) | ReadonlySource<SourceParams>;
        loader?: never;
        fromResourceById?: never;
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
        loader?: never;
        method?: never;
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
      }
    | {
        fromResourceById?: never;
        /**
         * A reactive function which determines the request to be made. Whenever the request changes, the
         * loader will be triggered to fetch a new value for the resource.
         *
         * If a request function isn't provided, the loader won't rerun unless the resource is reloaded.
         */
        params: (entity: ResourceRef<NoInfer<FromObjectState>>) => Params;
        loader?: never;
        method?: never;
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
      }
    | {
        /**
         * Use it, when you need to bind a ResourceByIdRef to another ResourceByIdRef.
         * It will enforce the fromObject keys syncing when the fromObject resource change.
         */
        fromResourceById?: never;
        /**
         * A reactive function which determines the request to be made. Whenever the request changes, the
         * loader will be triggered to fetch a new value for the resource.
         *
         * If a request function isn't provided, the loader won't rerun unless the resource is reloaded.
         */
        params: () => Params;
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
      }
  );

export type ResourceLikeMutationRef<
  Value,
  Params,
  IsMethod,
  ArgParams,
  SourceParams,
  Insertions,
> = {
  type: 'resourceLike';
  kind: 'mutation';
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

export type ResourceByIdLikeMutationRef<
  Value,
  Params,
  IsMethod,
  ArgParams,
  SourceParams,
  Insertions,
  GroupIdentifier,
> = { type: 'resourceByGroupLike'; kind: 'mutation' } & {
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

export type MutationRef<
  Value,
  Params,
  ArgParams,
  Insertions,
  IsMethod,
  SourceParams,
  GroupIdentifier,
> = [unknown] extends [GroupIdentifier]
  ? ResourceLikeMutationRef<
      Value,
      Params,
      IsMethod,
      ArgParams,
      SourceParams,
      Insertions
    >
  : ResourceByIdLikeMutationRef<
      Value,
      Params,
      IsMethod,
      ArgParams,
      SourceParams,
      Insertions,
      GroupIdentifier
    >;
//     & {
//   // ! Otherwise TS erases the types
//   [key in `~InternalType`]: 'Used to avoid TS type erasure';
// };

export type MutationOutput<
  State extends object | undefined,
  Params,
  ArgParams,
  SourceParams,
  GroupIdentifier,
  Insertions,
> = MutationRef<
  State,
  Params,
  ArgParams,
  Insertions,
  [unknown] extends [ArgParams] ? false : true, // ! force to method to have one arg minimum, we can not compare SourceParams type, because it also infer Params
  SourceParams,
  GroupIdentifier
>;

export function mutation<
  MutationState extends object | undefined,
  MutationParams,
  MutationArgsParams,
  SourceParams,
  GroupIdentifier,
  FromObjectGroupIdentifier extends string,
  FromObjectState,
  FromObjectResourceParams,
>(
  mutationConfig: MutationConfig<
    MutationState,
    MutationParams,
    MutationArgsParams,
    SourceParams,
    GroupIdentifier,
    FromObjectGroupIdentifier,
    FromObjectState,
    FromObjectResourceParams
  >,
): MutationOutput<
  MutationState,
  MutationParams,
  MutationArgsParams,
  SourceParams,
  GroupIdentifier,
  {}
>;
export function mutation<
  MutationState extends object | undefined,
  MutationParams,
  MutationArgsParams,
  SourceParams,
  GroupIdentifier,
  FromObjectGroupIdentifier extends string,
  FromObjectState,
  FromObjectResourceParams,
  Insertion1,
>(
  mutationConfig: MutationConfig<
    MutationState,
    MutationParams,
    MutationArgsParams,
    SourceParams,
    GroupIdentifier,
    FromObjectGroupIdentifier,
    FromObjectState,
    FromObjectResourceParams
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion1
  >,
): MutationOutput<
  MutationState,
  MutationParams,
  MutationArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1
>;
export function mutation<
  MutationState extends object | undefined,
  MutationParams,
  MutationArgsParams,
  SourceParams,
  GroupIdentifier,
  FromObjectGroupIdentifier extends string,
  FromObjectState,
  FromObjectResourceParams,
  Insertion1,
  Insertion2,
>(
  mutationConfig: MutationConfig<
    MutationState,
    MutationParams,
    MutationArgsParams,
    SourceParams,
    GroupIdentifier,
    FromObjectGroupIdentifier,
    FromObjectState,
    FromObjectResourceParams
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion2,
    Insertion1
  >,
): MutationOutput<
  MutationState,
  MutationParams,
  MutationArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2
>;
export function mutation<
  MutationState extends object | undefined,
  MutationParams,
  MutationArgsParams,
  SourceParams,
  GroupIdentifier,
  FromObjectGroupIdentifier extends string,
  FromObjectState,
  FromObjectResourceParams,
  Insertion1,
  Insertion2,
  Insertion3,
>(
  mutationConfig: MutationConfig<
    MutationState,
    MutationParams,
    MutationArgsParams,
    SourceParams,
    GroupIdentifier,
    FromObjectGroupIdentifier,
    FromObjectState,
    FromObjectResourceParams
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion3,
    Insertion1 & Insertion2
  >,
): MutationOutput<
  MutationState,
  MutationParams,
  MutationArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3
>;
export function mutation<
  MutationState extends object | undefined,
  MutationParams,
  MutationArgsParams,
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
  mutationConfig: MutationConfig<
    MutationState,
    MutationParams,
    MutationArgsParams,
    SourceParams,
    GroupIdentifier,
    FromObjectGroupIdentifier,
    FromObjectState,
    FromObjectResourceParams
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
): MutationOutput<
  MutationState,
  MutationParams,
  MutationArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4
>;
export function mutation<
  MutationState extends object | undefined,
  MutationParams,
  MutationArgsParams,
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
  mutationConfig: MutationConfig<
    MutationState,
    MutationParams,
    MutationArgsParams,
    SourceParams,
    GroupIdentifier,
    FromObjectGroupIdentifier,
    FromObjectState,
    FromObjectResourceParams
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
): MutationOutput<
  MutationState,
  MutationParams,
  MutationArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
>;
export function mutation<
  MutationState extends object | undefined,
  MutationParams,
  MutationArgsParams,
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
  mutationConfig: MutationConfig<
    MutationState,
    MutationParams,
    MutationArgsParams,
    SourceParams,
    GroupIdentifier,
    FromObjectGroupIdentifier,
    FromObjectState,
    FromObjectResourceParams
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
  insertion6: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
  >,
): MutationOutput<
  MutationState,
  MutationParams,
  MutationArgsParams,
  SourceParams,
  GroupIdentifier,
  Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6
>;
export function mutation<
  MutationState extends object | undefined,
  MutationParams,
  MutationArgsParams,
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
  mutationConfig: MutationConfig<
    MutationState,
    MutationParams,
    MutationArgsParams,
    SourceParams,
    GroupIdentifier,
    FromObjectGroupIdentifier,
    FromObjectState,
    FromObjectResourceParams
  >,
  insertion1: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion1
  >,
  insertion2: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion2,
    Insertion1
  >,
  insertion3: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion3,
    Insertion1 & Insertion2
  >,
  insertion4: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion4,
    Insertion1 & Insertion2 & Insertion3
  >,
  insertion5: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion5,
    Insertion1 & Insertion2 & Insertion3 & Insertion4
  >,
  insertion6: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion6,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5
  >,
  insertion7: InsertionsResourcesFactory<
    NoInfer<GroupIdentifier>,
    NoInfer<MutationState>,
    NoInfer<MutationParams>,
    Insertion7,
    Insertion1 & Insertion2 & Insertion3 & Insertion4 & Insertion5 & Insertion6
  >,
): MutationOutput<
  MutationState,
  MutationParams,
  MutationArgsParams,
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
 * Creates a reactive mutation manager that handles asynchronous operations with state tracking.
 *
 * This function manages mutation state by:
 * - Executing asynchronous operations (loader or stream) when triggered
 * - Tracking operation status (idle, loading, resolved, rejected)
 * - Providing reactive signals for value, status, error, and loading state
 * - Supporting both method-based triggers and source-based automatic execution
 * - Optionally enabling parallel mutation execution by grouping instances with an identifier
 *
 * @remarks
 * **Important:** This function must be called within an injection context.
 *
 * **Mutation Modes:**
 * - **Method-based:** Define a `method` function that returns params. Call `mutate()` to trigger the operation.
 * - **Source-based:** Use `afterRecomputation()` to bind to a source signal. The mutation executes automatically when the source changes.
 * - **Resource-based:** Bind to another `ResourceByIdRef` using `fromResourceById` to sync operations.
 *
 * **With Identifier:**
 * When an `identifier` function is provided, mutations are grouped by ID. Use `select(id)` to access individual mutation instances.
 *
 * @param config - Configuration object containing:
 *   - `method`: Function that takes args and returns params, or a `ReadonlySource` for automatic execution
 *   - `loader`: Async function that performs the mutation and returns a Promise of the result
 *   - `stream` (optional): Async function that returns a signal for streaming results
 *   - `identifier` (optional): Function to derive a unique ID from params for grouping mutations
 *   - `fromResourceById` (optional): Bind to another ResourceByIdRef for synced operations
 *   - `params` (optional): Function to derive params from a resource entity
 *   - Additional ResourceOptions like `equal`, `injector`, etc.
 * @param insertions - Optional insertion functions to add custom methods, computed values or side effects to the mutation.
 *   Insertions receive context with resource signals (`value`, `status`, `error`, `isLoading`, `hasValue`), `config`, and previous insertions.
 *   Methods bound to a source using `afterRecomputation` (effectRef-like) are not exposed in the output.
 * @returns A mutation reference object with:
 *   - `value`: Signal containing the mutation result (undefined if not yet executed)
 *   - `status`: Signal with current status ('idle' | 'loading' | 'resolved' | 'rejected')
 *   - `error`: Signal containing any error that occurred
 *   - `isLoading`: Signal indicating if the mutation is currently executing
 *   - `hasValue()`: Method to check if a value is available
 *   - `mutate(args)`: Method to trigger the mutation (only for method-based mutations)
 *   - `source`: The connected source (only for source-based mutations)
 *   - `select(id)`: Method to access a specific mutation instance by ID (only when identifier is provided)
 *   - Custom methods from insertions (excluding methods bound to sources)
 *
 * @example
 * Basic method-based mutation
 * ```ts
 * const updateUser = mutation({
 *   method: (userId: string) => ({ userId }),
 *   loader: async ({ params }) => {
 *     const response = await fetch(`/api/users/${params.userId}`, { method: 'PATCH' });
 *     return response.json();
 *   },
 * });
 *
 * // Check status
 * console.log(updateUser.status()); // 'idle'
 * console.log(updateUser.isLoading()); // false
 *
 * // Trigger mutation
 * updateUser.mutate('user-123');
 * console.log(updateUser.status()); // 'loading'
 *
 * // After completion
 * console.log(updateUser.value()); // { id: 'user-123', name: '...' }
 * console.log(updateUser.status()); // 'resolved'
 * ```
 *
 * @example
 * Source-based automatic mutation
 * ```ts
 *  todo change example for mutation
 * const updateUserSource = source<{ userId: string, email: string }>();
 *
 *  const updateUser = mutation({
 *   method:  afterRecomputation(updateUserSource, (params) => params),
 *   loader: async ({ params }) => {
 *     const response = await fetch(`/api/users/${params.userId}`, { method: 'PATCH' });
 *     return response.json();
 *   },
 * });
 *
 * // Mutation executes automatically when source changes
 * updateUserSource.set({ userId: 'user-123', email: 'newemail@example.com' });
 * console.log(updateUser.status()); // 'loading'
 * ```
 *
 * @example
 * Mutation with identifier for grouping
 * ```ts
 * const deleteItem = mutation({
 *   method: (itemId: string) => ({ itemId }),
 *   identifier: (params) => params.itemId,
 *   loader: async ({ params }) => {
 *     await fetch(`/api/items/${params.itemId}`, { method: 'DELETE' });
 *     return { deleted: true };
 *   },
 * });
 *
 * // Trigger mutations for different items
 * deleteItem.mutate('item-1');
 * deleteItem.mutate('item-2');
 *
 * // Access individual mutation states
 * const item1Mutation = deleteItem.select('item-1');
 * console.log(item1Mutation?.status()); // 'loading' or 'resolved'
 * console.log(item1Mutation?.value()); // { deleted: true }
 * ```
 *
 * @example
 * With custom methods via insertions
 * ```ts
 * const createPost = mutation(
 *   {
 *     method: (data: { title: string; content: string }) => data,
 *     loader: async ({ params }) => {
 *       const response = await fetch('/api/posts', {
 *         method: 'POST',
 *         body: JSON.stringify(params),
 *       });
 *       return response.json();
 *     },
 *   },
 *   ({ value, isLoading }) => ({
 *     isSuccess: computed(() => value() !== undefined && !isLoading()),
 *     reset: () => {
 *       // Custom reset logic
 *     },
 *   })
 * );
 *
 * createPost.mutate({ title: 'Hello', content: 'World' });
 * console.log(createPost.isSuccess()); // Custom computed from insertion
 * ```
 *
 * @example
 * Binding to another ResourceByIdRef
 * ```ts
 * // First, create a source mutation by ID
 * const fetchUsers = mutation({
 *   method: (userId: string) => ({ userId }),
 *   identifier: (params) => params.userId,
 *   loader: async ({ params }) => {
 *     const response = await fetch(`/api/users/${params.userId}`);
 *     return response.json();
 *   },
 * });
 *
 * // Then create a derived mutation that processes the results
 * const processedUsers = mutation({
 *   fromResourceById: fetchUsers,
 *   params: ({ value, status }) => {
 *     // Only process when the source is resolved
 *     return status() === 'resolved' ? value() : undefined;
 *   },
 *   identifier: (params) => params.userId,
 *   loader: async ({ params }) => {
 *     // Process the user data
 *     return {
 *       ...params,
 *       processed: true,
 *       timestamp: Date.now(),
 *     };
 *   },
 * });
 *
 * // Trigger the source mutation
 * fetchUsers.mutate('user-123');
 *
 * // The derived mutation automatically executes when fetchUsers resolves
 * // Access the processed result
 * const processed = processedUsers.select('user-123');
 * console.log(processed?.value()); // { userId: 'user-123', processed: true, ... }
 * ```
 */
export function mutation<
  MutationState extends object | undefined,
  MutationParams,
  MutationArgsParams,
  SourceParams,
  GroupIdentifier,
  FromObjectGroupIdentifier extends string,
  FromObjectState,
  FromObjectResourceParams,
>(
  mutationConfig: MutationConfig<
    MutationState,
    MutationParams,
    MutationArgsParams,
    SourceParams,
    GroupIdentifier,
    FromObjectGroupIdentifier,
    FromObjectState,
    FromObjectResourceParams
  >,
  ...insertions: any[]
): MutationOutput<
  MutationState,
  MutationParams,
  MutationArgsParams,
  SourceParams,
  GroupIdentifier,
  {}
> {
  const mutationResourceParamsFnSignal =
    //@ts-expect-error if no params, it will create a signal
    mutationConfig.params ?? signal<MutationParams | undefined>(undefined);

  const isConnectedToAResourceById = 'fromResourceById' in mutationConfig;

  const isConnectedToSource =
    'method' in mutationConfig && isSignal(mutationConfig.method);
  const isUsingIdentifier = 'identifier' in mutationConfig;

  const resourceParamsSrc = isConnectedToSource
    ? mutationConfig.method
    : mutationResourceParamsFnSignal;

  const resourceTarget = isUsingIdentifier
    ? resourceById<
        MutationState,
        MutationParams,
        GroupIdentifier & string,
        FromObjectGroupIdentifier,
        FromObjectState,
        FromObjectResourceParams
      >({
        ...mutationConfig,
        params: resourceParamsSrc,
        identifier: mutationConfig.identifier,
      } as any)
    : resource<MutationState, MutationParams>({
        ...mutationConfig,
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
            MutationState,
            MutationParams
          >,
          select: (id: GroupIdentifier) => {
            return computed(() => {
              const list = (
                resourceTarget as ResourceByIdRef<
                  GroupIdentifier & string,
                  MutationState,
                  MutationParams
                >
              )();
              //@ts-expect-error GroupIdentifier & string is not recognized correctly
              return list[id];
            })();
          },
        }
      : {},
    {
      type: isUsingIdentifier ? 'resourceByGroupLike' : 'resourceLike',
      resourceParamsSrc: resourceParamsSrc as WritableSignal<
        MutationParams | undefined
      >,
      mutate:
        isConnectedToAResourceById ||
        ('method' in mutationConfig && isSignal(mutationConfig.method))
          ? undefined
          : (arg: MutationArgsParams) => {
              const result =
                'method' in mutationConfig
                  ? mutationConfig.method?.(arg)
                  : undefined;
              // make sure  mutationResourceParamsFnSignal.set(result as MutationParams); is set before calling addById
              mutationResourceParamsFnSignal.set(result as MutationParams);
              if (isUsingIdentifier) {
                const id = mutationConfig.identifier?.(arg as any);
                (
                  resourceTarget as ResourceByIdRef<
                    GroupIdentifier & string,
                    MutationState,
                    MutationParams
                  >
                ).addById(id as GroupIdentifier & string);
              }
              return result;
            },
    },
    (
      insertions as InsertionsResourcesFactory<
        NoInfer<GroupIdentifier>,
        NoInfer<MutationState>,
        NoInfer<MutationParams>,
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
                  identifier: mutationConfig.identifier,
                }
              : { resource: resourceTarget }),
            resourceParamsSrc: resourceParamsSrc as WritableSignal<
              NoInfer<MutationParams>
            >,
            insertions: acc as {},
          } as any),
        };
      },
      {} as Record<string, unknown>,
    ),
  ) as unknown as MutationOutput<
    MutationState,
    MutationParams,
    MutationArgsParams,
    SourceParams,
    GroupIdentifier,
    {}
  >;
}
