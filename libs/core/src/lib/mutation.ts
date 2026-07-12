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
import { CraftResourceRef } from './util/craft-resource-ref';
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

type MutationConfigProviderNames<Providers> =
  Providers extends readonly (infer P)[]
    ? P extends BrandedServiceProvider<infer Name, any, any>
      ? Name
      : never
    : never;

type SatisfyDependencies<Deps, SatisfiedNames extends string> = {
  [K in keyof Deps as K extends SatisfiedNames ? never : K]: Deps[K];
};

type MutationTrackedDependencies<
  ParamsYielded = never,
  MethodYielded = never,
  LoaderYielded = never,
  StreamYielded = never,
  InsertionsYielded = never,
  Providers = never,
> = [MutationConfigProviderNames<Providers>] extends [never]
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
      MutationConfigProviderNames<Providers>
    >;

type MutationDependenciesMetadata<Dependencies> = [keyof Dependencies] extends [
  never,
]
  ? {}
  : {
      readonly [SERVICE_HELPER_DEPENDENCIES]?: Dependencies;
    };

const MUTATION_INVALID_YIELD_ERROR_MESSAGE =
  'mutation generators can only yield craftService dependencies or exposed dependency helpers.';
const MUTATION_APP_START_ERROR_MESSAGE =
  'mutation generators do not support onAppStart(...).';

type MutationConfig<
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
         * Used to generate a method in the store, when called will trigger the resource loader/stream.
         *
         * ! It required One parameter at least to be able to generate the method (otherwise it will think it is bind to a source, see below).
         *
         * Only support one parameter which can be an object to pass multiple parameters.
         *
         * It also accepts a ReadonlySource<SourceParams> to connect the mutation params to an external signal source.
         */
        method:
          | GeneratorCompatibleFactory<
              (args: ParamsArgs) => Params,
              MethodYielded
            >
          | ReadonlySource<SourceParams>;
        fromResourceById?: never;
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
          ) => Promise<ResourceState> | ResourceState,
          LoaderYielded
        >;
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
        method:
          | GeneratorCompatibleFactory<
              (args: ParamsArgs) => Params,
              MethodYielded
            >
          | ReadonlySource<SourceParams>;
        loader?: never;
        fromResourceById?: never;
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
        loader?: never;
        method?: never;
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
          (
            entity: CraftResourceRef<
              NoInfer<FromObjectState>,
              NoInfer<FromObjectResourceParams>
            >,
          ) => Params,
          ParamsYielded
        >;
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
          ) => Promise<ResourceState> | ResourceState,
          LoaderYielded
        >;
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
        params: GeneratorCompatibleFactory<
          (entity: ResourceRef<NoInfer<FromObjectState>>) => Params,
          ParamsYielded
        >;
        loader?: never;
        method?: never;
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
              NonNullable<
                [unknown] extends [Params]
                  ? NoInfer<StripCraftException<SourceParams>>
                  : NoInfer<StripCraftException<Params>>
              >
            >,
          ) => Promise<ResourceState> | ResourceState,
          LoaderYielded
        >;
        stream?: never;
      }
  );

type HasDefinedException<
  MutationException extends ResourceExceptionConstraints,
> = [MutationException['params']] extends [never]
  ? [MutationException['loader']] extends [never]
    ? false
    : true
  : true;

export type ResourceLikeMutationExceptions<
  MutationException extends ResourceExceptionConstraints,
  GroupIdentifier = unknown,
> =
  HasDefinedException<MutationException> extends true
    ? {
        hasException: Signal<HasDefinedException<MutationException>>;
        exception: Signal<
          | InsertMetaInCraftExceptionIfExists<
              MutationException['params'],
              'params',
              unknown
            >
          | InsertMetaInCraftExceptionIfExists<
              MutationException['loader'],
              'loader',
              GroupIdentifier
            >
          | undefined
        >;
        exceptions: Signal<{
          list: (
            | InsertMetaInCraftExceptionIfExists<
                MutationException['params'],
                'params',
                unknown
              >
            | InsertMetaInCraftExceptionIfExists<
                MutationException['loader'],
                'loader',
                GroupIdentifier
              >
          )[];
          params?: InsertMetaInCraftExceptionIfExists<
            MutationException['params'],
            'params',
            unknown
          >;
          loader?: InsertMetaInCraftExceptionIfExists<
            MutationException['loader'],
            'loader',
            GroupIdentifier
          >;
        }>;
      }
    : {};

export type ResourceByIdLikeMutationExceptions<
  MutationException extends ResourceExceptionConstraints,
  GroupIdentifier extends string,
> = {
  hasException: Signal<boolean>;
  exceptions: Signal<{
    list: (
      | InsertMetaInCraftExceptionIfExists<
          MutationException['params'],
          'params',
          unknown
        >
      | InsertMetaInCraftExceptionIfExists<
          MutationException['loader'],
          'loader',
          GroupIdentifier
        >
    )[];
    params?: InsertMetaInCraftExceptionIfExists<
      MutationException['params'],
      'params',
      unknown
    >;
    loader: Partial<
      Record<
        GroupIdentifier,
        InsertMetaInCraftExceptionIfExists<
          MutationException['loader'],
          'loader',
          GroupIdentifier
        >
      >
    >;
  }>;
};

export type ResourceLikeMutationRef<
  Value,
  Params,
  IsMethod,
  ArgParams,
  SourceParams,
  Insertions,
  MutationException extends ResourceExceptionConstraints,
  Dependencies = {},
> = {
  type: 'resourceLike';
  kind: 'mutation';
} & MergeObjects<
  [
    {
      readonly value: Signal<Value | undefined>;
      readonly status: Signal<CraftResourceStatus>;
      readonly isLoading: Signal<boolean>;
      readonly safeValue: Signal<Value | undefined>;
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
    ResourceLikeMutationExceptions<MutationException>,
    {
      [key in `~InternalType`]: 'Used to avoid TS type erasure';
    },
    MutationDependenciesMetadata<Dependencies>,
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
  MutationException extends ResourceExceptionConstraints,
  Dependencies = {},
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
    | ({
        readonly value: Signal<Value | undefined>;
        readonly status: Signal<CraftResourceStatus>;
        readonly isLoading: Signal<boolean>;
        readonly safeValue: Signal<Value | undefined>;
        hasValue(): boolean;
      } & ResourceLikeMutationExceptions<MutationException, GroupIdentifier>)
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
      [GroupIdentifier] extends [string]
        ? ResourceByIdLikeMutationExceptions<MutationException, GroupIdentifier>
        : {},
      MutationDependenciesMetadata<Dependencies>,
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
  MutationExceptions extends
    ResourceExceptionConstraints = ResourceExceptionConstraints,
  Dependencies = {},
> = [unknown] extends [GroupIdentifier]
  ? ResourceLikeMutationRef<
      Value,
      Params,
      IsMethod,
      ArgParams,
      SourceParams,
      Insertions,
      MutationExceptions,
      Dependencies
    >
  : ResourceByIdLikeMutationRef<
      Value,
      Params,
      IsMethod,
      ArgParams,
      SourceParams,
      Insertions,
      GroupIdentifier,
      MutationExceptions,
      Dependencies
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
  MutationExceptions extends ResourceExceptionConstraints,
  Dependencies = {},
> = MutationRef<
  StripCraftException<State>,
  StripCraftException<Params>,
  ArgParams,
  Insertions,
  [unknown] extends [ArgParams] ? false : true, // ! force to method to have one arg minimum, we can not compare SourceParams type, because it also infer Params
  SourceParams,
  GroupIdentifier,
  MutationExceptions,
  Dependencies
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
    params: ExtractCraftException<MutationParams>;
    loader: ExtractCraftException<MutationState>;
  },
>(
  mutationConfig: MutationConfig<
    MutationState,
    MutationParams,
    MutationArgsParams,
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
): MutationOutput<
  StripCraftException<MutationState>,
  StripCraftException<MutationParams>,
  MutationArgsParams,
  StripCraftException<MutationParams>,
  GroupIdentifier,
  {},
  Exceptions,
  MutationTrackedDependencies<
    ParamsYielded,
    MethodYielded,
    LoaderYielded,
    StreamYielded,
    never,
    Providers
  >
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
    params: ExtractCraftException<MutationParams>;
    loader: ExtractCraftException<MutationState>;
  },
>(
  mutationConfig: MutationConfig<
    MutationState,
    MutationParams,
    MutationArgsParams,
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
    NoInfer<StripCraftException<MutationState>>,
    NoInfer<StripCraftException<MutationParams>>,
    NoInfer<Exceptions>,
    Insertion1,
    {},
    Insertion1Yielded
  >,
): MutationOutput<
  StripCraftException<MutationState>,
  StripCraftException<MutationParams>,
  MutationArgsParams,
  StripCraftException<MutationParams>,
  GroupIdentifier,
  Insertion1,
  Exceptions,
  MutationTrackedDependencies<
    ParamsYielded,
    MethodYielded,
    LoaderYielded,
    StreamYielded,
    Insertion1Yielded,
    Providers
  >
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
 * @param insertion1 - Optional single insertion factory to add custom methods, computed values or side effects to the mutation.
 *   The insertion receives a context with resource signals (`value`, `status`, `error`, `isLoading`, `hasValue`) and `config`.
 *   To attach several insertions, compose them with `insertPipe`:
 *   `mutation(config, (context) => insertPipe(context, insertion1, insertion2))` —
 *   each member then also sees the previous members' outputs on `context.insertions`.
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
 * Business exceptions with `craftException`
 * ```ts
 * import { craftException, mutation } from '@craft-ng/core';
 *
 * const updateUser = mutation({
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
 *       : { id: params, updated: true },
 * });
 *
 * updateUser.mutate('ab');
 * console.log(updateUser.hasException()); // true
 * console.log(updateUser.exceptions().params?.SEARCH_TERM_TOO_SHORT);
 *
 * updateUser.mutate('blocked');
 * console.log(updateUser.exceptions().loader?.USER_ACCESS_FORBIDDEN);
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
    params: ExtractCraftException<MutationParams>;
    loader: ExtractCraftException<MutationState>;
  },
>(
  mutationConfig: MutationConfig<
    MutationState,
    MutationParams,
    MutationArgsParams,
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
): MutationOutput<
  MutationState,
  MutationParams,
  MutationArgsParams,
  SourceParams,
  GroupIdentifier,
  {},
  Exceptions
> {
  const insertionSnapshotRegistry = new InsertionSnapshotRegistry();
  const mutationExtraProviders = [
    {
      provide: INSERTION_SNAPSHOT_REGISTRY,
      useValue: insertionSnapshotRegistry,
    },
    ...(mutationConfig.providers ?? []),
  ];

  let injector: Injector | undefined;
  if (
    [
      'params' in mutationConfig ? mutationConfig.params : undefined,
      'method' in mutationConfig ? mutationConfig.method : undefined,
      'loader' in mutationConfig ? mutationConfig.loader : undefined,
      'stream' in mutationConfig ? mutationConfig.stream : undefined,
      ...insertions,
    ].some((value) => isGeneratorFunction(value))
  ) {
    assertInInjectionContext(mutation);
    injector = ɵcreateHostTaggedInjector(
      inject(Injector),
      'mutation',
      mutationExtraProviders,
    );
  }

  const getInjector = () => {
    if (!injector) {
      assertInInjectionContext(mutation);
      injector = ɵcreateHostTaggedInjector(
        inject(Injector),
        'mutation',
        mutationExtraProviders,
      );
    }

    return injector;
  };

  const mutationResourceParamsFnSignal =
    //@ts-expect-error if no params, it will create a signal
    mutationConfig.params ?? signal<MutationParams | undefined>(undefined);

  const isConnectedToAResourceById = 'fromResourceById' in mutationConfig;

  const isConnectedToSource =
    'method' in mutationConfig && isSignal(mutationConfig.method);
  const hasMethodFn =
    'method' in mutationConfig &&
    typeof mutationConfig.method === 'function' &&
    !isSignal(mutationConfig.method);
  const isUsingIdentifier = 'identifier' in mutationConfig;

  const methodParamsException = signal<AnyCraftException | undefined>(
    undefined,
  );

  const getIdentifierFromParams = (params: unknown): string | undefined => {
    if (!isUsingIdentifier || !('identifier' in mutationConfig)) {
      return undefined;
    }

    if (params === undefined || params === null) {
      return undefined;
    }

    return mutationConfig.identifier?.(params as any) as string | undefined;
  };

  const sanitizeParamsResult = (value: MutationParams | undefined) => {
    if (isCraftException(value)) {
      return undefined;
    }

    return value;
  };

  const reactiveParamsException = computed(() => {
    if (hasMethodFn) {
      return undefined;
    }

    if (
      isConnectedToSource &&
      'method' in mutationConfig &&
      mutationConfig.method
    ) {
      const sourceValue = (
        mutationConfig.method as unknown as Signal<MutationParams | undefined>
      )();
      return isCraftException(sourceValue)
        ? enrichResourceException(sourceValue, { scope: 'params' })
        : undefined;
    }

    if (
      'params' in mutationConfig &&
      !('fromResourceById' in mutationConfig && mutationConfig.fromResourceById)
    ) {
      const paramsValue = executeGeneratorCompatibleFactory({
        factory: mutationConfig.params as () => MutationParams,
        thisArg: undefined,
        getInjector,
        args: [],
        invalidYieldErrorMessage: MUTATION_INVALID_YIELD_ERROR_MESSAGE,
        multipleAppStartErrorMessage: MUTATION_APP_START_ERROR_MESSAGE,
        onAppStartNotSupportedErrorMessage: MUTATION_APP_START_ERROR_MESSAGE,
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
    'params' in mutationConfig
      ? (((...args: unknown[]) =>
          sanitizeParamsResult(
            executeGeneratorCompatibleFactory({
              factory: mutationConfig.params as (
                ...args: unknown[]
              ) => MutationParams,
              thisArg: undefined,
              getInjector,
              args,
              invalidYieldErrorMessage: MUTATION_INVALID_YIELD_ERROR_MESSAGE,
              multipleAppStartErrorMessage: MUTATION_APP_START_ERROR_MESSAGE,
              onAppStartNotSupportedErrorMessage:
                MUTATION_APP_START_ERROR_MESSAGE,
            }) as MutationParams,
          )) as typeof mutationConfig.params)
      : undefined;

  const wrappedSourceParams =
    isConnectedToSource && 'method' in mutationConfig && mutationConfig.method
      ? ((() =>
          sanitizeParamsResult(
            (
              mutationConfig.method as unknown as Signal<
                MutationParams | undefined
              >
            )(),
          )) as Signal<MutationParams | undefined>)
      : undefined;

  const wrappedLoader =
    'loader' in mutationConfig && mutationConfig.loader
      ? ((async (param: ResourceLoaderParams<any>) => {
          const injector = getInjector();
          const correlationSvc = injector.get(CORRELATION_ID_SERVICE, null);
          const operationId = correlationSvc?.lastCorrelationId() ?? null;
          if (operationId) correlationSvc?.startOperation(operationId);

          try {
            const result = await executeGeneratorCompatibleFactory({
              factory: mutationConfig.loader as (
                param: ResourceLoaderParams<any>,
              ) => Promise<any>,
              thisArg: undefined,
              getInjector,
              args: [param],
              invalidYieldErrorMessage: MUTATION_INVALID_YIELD_ERROR_MESSAGE,
              multipleAppStartErrorMessage: MUTATION_APP_START_ERROR_MESSAGE,
              onAppStartNotSupportedErrorMessage:
                MUTATION_APP_START_ERROR_MESSAGE,
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
              return undefined;
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
        }) as typeof mutationConfig.loader)
      : undefined;

  const wrappedStream =
    'stream' in mutationConfig && mutationConfig.stream
      ? (((...args: unknown[]) =>
          executeGeneratorCompatibleFactory({
            factory: mutationConfig.stream as (...args: unknown[]) => unknown,
            thisArg: undefined,
            getInjector,
            args,
            invalidYieldErrorMessage: MUTATION_INVALID_YIELD_ERROR_MESSAGE,
            multipleAppStartErrorMessage: MUTATION_APP_START_ERROR_MESSAGE,
            onAppStartNotSupportedErrorMessage:
              MUTATION_APP_START_ERROR_MESSAGE,
          })) as typeof mutationConfig.stream)
      : undefined;

  const resourceParamsSrc = isConnectedToSource
    ? (wrappedSourceParams as typeof mutationConfig.method)
    : (wrappedParamsFn ?? mutationResourceParamsFnSignal);

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
        loader: wrappedLoader,
        stream: wrappedStream,
        identifier: mutationConfig.identifier,
      } as any)
    : craftResource<MutationState, MutationParams>({
        ...mutationConfig,
        params: resourceParamsSrc,
        loader: wrappedLoader,
        stream: wrappedStream,
      } as ResourceOptions<any, any>);

  runInInjectionContext(getInjector(), () =>
    ɵobservePrimitiveResourceRuntimeContext(
      isUsingIdentifier
        ? ɵcreatePrimitiveResourceByIdRuntimeContext(
            'mutation',
            resourceTarget as any,
          )
        : ɵcreatePrimitiveResourceRuntimeContext(
            'mutation',
            resourceTarget as any,
          ),
    ),
  );

  // Capture the raw Angular status BEFORE `Object.assign` overrides
  // `resourceTarget.status` with the craft computed (avoids a computation cycle).
  const rawResourceStatus = (resourceTarget as ResourceRef<MutationState>)
    .status;

  if (!isUsingIdentifier) {
    Object.assign(resourceTarget, {
      safeValue: computed(() => {
        const resourceRef = resourceTarget as ResourceRef<MutationState>;
        return resourceRef.hasValue() ? resourceRef.value() : undefined;
      }),
    });
  }

  const output = Object.assign(
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
                  MutationState,
                  MutationParams
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
      type: isUsingIdentifier ? 'resourceByGroupLike' : 'resourceLike',
      kind: 'mutation' as const,
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
        MutationParams | undefined
      >,
      mutate:
        isConnectedToAResourceById ||
        ('method' in mutationConfig && isSignal(mutationConfig.method))
          ? undefined
          : (arg: MutationArgsParams) => {
              const result =
                'method' in mutationConfig
                  ? executeGeneratorCompatibleFactory({
                      factory: mutationConfig.method as (
                        args: MutationArgsParams,
                      ) => MutationParams,
                      thisArg: undefined,
                      getInjector,
                      args: [arg],
                      invalidYieldErrorMessage:
                        MUTATION_INVALID_YIELD_ERROR_MESSAGE,
                      multipleAppStartErrorMessage:
                        MUTATION_APP_START_ERROR_MESSAGE,
                      onAppStartNotSupportedErrorMessage:
                        MUTATION_APP_START_ERROR_MESSAGE,
                    })
                  : undefined;

              if (isCraftException(result)) {
                methodParamsException.set(
                  enrichResourceException(result, { scope: 'params' }),
                );
                return result as MutationParams;
              }

              if (methodParamsException()) {
                methodParamsException.set(undefined);
              }
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
  ) as unknown as MutationOutput<
    MutationState,
    MutationParams,
    MutationArgsParams,
    SourceParams,
    GroupIdentifier,
    {},
    Exceptions
  >;

  const insertionsResult = (
    insertions as InsertionsResourcesFactory<
      NoInfer<GroupIdentifier>,
      NoInfer<StripCraftException<MutationState>>,
      NoInfer<StripCraftException<MutationParams>>,
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
                  identifier: mutationConfig.identifier,
                }
              : { resource: resourceTarget }),
            resourceParamsSrc: resourceParamsSrc as WritableSignal<
              NoInfer<MutationParams>
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
        invalidYieldErrorMessage: MUTATION_INVALID_YIELD_ERROR_MESSAGE,
        multipleAppStartErrorMessage: MUTATION_APP_START_ERROR_MESSAGE,
        onAppStartNotSupportedErrorMessage: MUTATION_APP_START_ERROR_MESSAGE,
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
                  'mutation',
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
                    invalidYieldErrorMessage:
                      MUTATION_INVALID_YIELD_ERROR_MESSAGE,
                    multipleAppStartErrorMessage:
                      MUTATION_APP_START_ERROR_MESSAGE,
                    onAppStartNotSupportedErrorMessage:
                      MUTATION_APP_START_ERROR_MESSAGE,
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

  Object.assign(output, insertionsResult);

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

  const destroyRefMutation = injector
    ? injector.get(DestroyRef, null)
    : (() => {
        try {
          return inject(DestroyRef, { optional: true });
        } catch {
          return null;
        }
      })();

  if (snapshotRegistry && destroyRefMutation) {
    snapshotRegistry.triggerSnapshot$
      .pipe(takeUntilDestroyed(destroyRefMutation))
      .subscribe(() => {
        const insertionSnapshots = triggerAndCollectInsertions(
          insertionSnapshotRegistry,
        );
        let stateSnapshot: unknown;
        try {
          if (isUsingIdentifier) {
            const byId = (resourceTarget as any)();
            stateSnapshot = {
              params: resourceParamsSrc(),
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
              params: resourceParamsSrc(),
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
          source: 'mutation',
          from: hostTagList,
          state: stateSnapshot,
        });
      });
  }

  return output;
}
