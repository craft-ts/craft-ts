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

type MutationConfig<
  ResourceState,
  Params,
  ParamsArgs,
  SourceParams,
  GroupIdentifier,
  FromObjectGroupIdentifier extends string,
  FromObjectState,
  FromObjectResourceParams
> =
  | Omit<ResourceOptions<NoInfer<ResourceState>, Params>, 'params' | 'loader'> &
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
              | ((args: ParamsArgs) => Params)
              | ReadonlySource<SourceParams>;
            fromResourceById?: never;
            /**
             * A unique identifier for the resource, derived from the params.
             * It should be a string that uniquely identifies the resource based on the params.
             */
            identifier?: (
              params: NoInfer<NonNullable<Params>>
            ) => GroupIdentifier;
            loader: (
              param: ResourceLoaderParams<
                NonNullable<
                  [unknown] extends [Params]
                    ? NoInfer<SourceParams>
                    : NoInfer<Params>
                >
              >
            ) => Promise<ResourceState>;
            stream?: never;
            preservePreviousValue?: () => boolean;
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
              | ((args: ParamsArgs) => Params)
              | ReadonlySource<SourceParams>;
            loader?: never;
            fromResourceById?: never;
            identifier?: (
              params: NoInfer<NonNullable<Params>>
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
                    : NoInfer<Params>
                >
              >
            >;
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
            loader?: never;
            method?: never;
            identifier?: (
              params: NoInfer<NonNullable<Params>>
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
                    : NoInfer<Params>
                >
              >
            >;
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
            /**
             * A unique identifier for the resource, derived from the params.
             * It should be a string that uniquely identifies the resource based on the params.
             */
            identifier?: (
              params: NoInfer<NonNullable<Params>>
            ) => GroupIdentifier;
            loader: (
              param: ResourceLoaderParams<
                NonNullable<
                  [unknown] extends [Params]
                    ? NoInfer<SourceParams>
                    : NoInfer<Params>
                >
              >
            ) => Promise<ResourceState>;
            stream?: never;
            preservePreviousValue?: () => boolean;
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
            identifier?: (
              params: NoInfer<NonNullable<Params>>
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
                    : NoInfer<Params>
                >
              >
            >;
            preservePreviousValue?: () => boolean;
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
            identifier?: (
              params: NoInfer<NonNullable<Params>>
            ) => GroupIdentifier;
            loader: (
              param: ResourceLoaderParams<
                NonNullable<
                  [unknown] extends [Params]
                    ? NoInfer<SourceParams>
                    : NoInfer<Params>
                >
              >
            ) => Promise<ResourceState>;
            stream?: never;
            preservePreviousValue?: () => boolean;
          }
      );

export type MutationRef<
  Value,
  ArgParams,
  Params,
  Insertions,
  IsMethod,
  SourceParams,
  GroupIdentifier
> = AsyncMethodRef<
  Value,
  ArgParams,
  Params,
  Insertions,
  IsMethod,
  SourceParams,
  GroupIdentifier
> & {
  // ! Otherwise TS erases the types
  [key in `~InternalType`]: 'Used to avoid TS type erasure';
};

export type MutationOutput<
  State extends object | undefined,
  Params,
  ArgParams,
  SourceParams,
  GroupIdentifier,
  Insertions
> = MutationRef<
  State,
  ArgParams,
  Params,
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
  FromObjectResourceParams
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
  >
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
  Insertion1
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
  >
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
  Insertion2
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
  >
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
  Insertion3
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
  >
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
  Insertion4
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
  >
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
  Insertion5
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
  >
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
  Insertion6
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
  >
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
  Insertion7
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
  >
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
export function mutation<
  MutationState extends object | undefined,
  MutationParams,
  MutationArgsParams,
  SourceParams,
  GroupIdentifier,
  FromObjectGroupIdentifier extends string,
  FromObjectState,
  FromObjectResourceParams
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
      resourceParamsSrc: resourceParamsSrc as WritableSignal<
        MutationParams | undefined
      >,
      method:
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
    )?.reduce((acc, insert) => {
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
    }, {} as Record<string, unknown>)
  ) as unknown as MutationOutput<
    MutationState,
    MutationParams,
    MutationArgsParams,
    SourceParams,
    GroupIdentifier,
    {}
  >;
}
