import {
  setAllPatchFromMutationOnQueryValue,
  setAllUpdatesFromMutationOnQueryValue,
  triggerQueryReloadOnMutationStatusChange,
} from './query.core';
import { MergeObject, MergeObjects } from './util/util.type';
import {
  ContextConstraints,
  CraftFactoryUtility,
  StoreConfigConstraints,
  PartialContext,
  CraftFactoryEntries,
  craftFactoryEntries,
  partialContext,
} from './craft';
import {
  effect,
  EffectRef,
  Injector,
  linkedSignal,
  ResourceRef,
  Signal,
  untracked,
} from '@angular/core';
import { ResourceByIdRef } from './resource-by-id';
import { nestedEffect } from './util/types/util';
import { QueryOutput, QueryRef } from './query';
import {
  MutationOutput,
  ResourceByIdLikeMutationRef,
  ResourceLikeMutationRef,
} from './mutation';
import {
  FilterQueryById,
  PatchMutationQuery,
  QueryAndMutationRecordConstraints,
  ReloadQueriesConfig,
} from './util/types/shared.type';
import { InternalType } from './util/types/util.type';

type UpdateData<
  QueryAndMutationRecord extends QueryAndMutationRecordConstraints,
> = MergeObjects<
  [
    {
      queryResource: ResourceRef<QueryAndMutationRecord['query']['state']>;
      mutationResource: ResourceRef<
        NoInfer<QueryAndMutationRecord['mutation']['state']>
      >;
      mutationParams: NonNullable<
        NoInfer<QueryAndMutationRecord['mutation']['params']>
      >;
    },
    QueryAndMutationRecord['query']['isGroupedResource'] extends true
      ? {
          queryIdentifier: QueryAndMutationRecord['query']['groupIdentifier'];
          queryResources: ResourceByIdRef<
            string,
            QueryAndMutationRecord['query']['state'],
            QueryAndMutationRecord['query']['params']
          >;
        }
      : {},
    QueryAndMutationRecord['mutation']['groupIdentifier'] extends
      | string
      | number
      ? {
          mutationIdentifier: QueryAndMutationRecord['mutation']['groupIdentifier'];
          mutationResources: ResourceByIdRef<
            string,
            QueryAndMutationRecord['mutation']['state'],
            QueryAndMutationRecord['mutation']['params']
          >;
        }
      : {},
  ]
>;

type QueryDeclarativeEffect<
  QueryAndMutationRecord extends QueryAndMutationRecordConstraints,
> = MergeObjects<
  [
    {
      /**
       * Run when the mutation is in loading state.
       */
      optimisticUpdate?: (
        data: UpdateData<QueryAndMutationRecord>,
      ) => QueryAndMutationRecord['query']['state'];
      /**
       * Run when the mutation is in loaded state.
       */
      update?: (
        data: UpdateData<QueryAndMutationRecord>,
      ) => QueryAndMutationRecord['query']['state'];
      reload?: ReloadQueriesConfig<QueryAndMutationRecord>;
      /**
       * Run when the mutation is in loading state.
       * Will patch the query specific state with the mutation data.
       * If the query is loading, it will not patch.
       * If the mutation data is not compatible with the query state, it will not patch.
       * Be careful! If the mutation is already in a loading state, trigger the mutation again will cancelled the previous mutation loader and will patch with the new value.
       */
      optimisticPatch?: PatchMutationQuery<QueryAndMutationRecord>;
      /**
       * Run when the mutation is in loaded state.
       * Will patch the query specific state with the mutation data.
       * If the query is loading, it will not patch.
       * If the mutation data is not compatible with the query state, it will not patch.
       * Be careful! If the mutation is already in a loading state, trigger the mutation again will cancelled the previous mutation loader and will patch with the new value.
       */
      patch?: PatchMutationQuery<QueryAndMutationRecord>;
    },
    QueryAndMutationRecord['mutation']['isGroupedResource'] extends true
      ? {
          filter: FilterQueryById<QueryAndMutationRecord>;
        }
      : QueryAndMutationRecord['query']['isGroupedResource'] extends true
        ? {
            filter: FilterQueryById<QueryAndMutationRecord>;
          }
        : {},
  ]
>;

export type QueryOptions<
  Context extends ContextConstraints,
  ResourceState extends object | undefined,
  ResourceParams,
  GroupIdentifier,
  ResourceArgsParams,
> = {
  // todo dans _mutation partager explicitement le type via InternalType et le MutationRef
  on?: Context['_mutation'] extends infer Mutations
    ? {
        [key in keyof Mutations as `${key &
          string}Mutation`]?: Mutations[key] extends MutationOutput<
          infer MutationState,
          infer MutationParams,
          infer MutationArgParams,
          infer MutationSourceParams,
          infer MutationGroupIdentifier,
          infer MutationInsertions
        >
          ? QueryDeclarativeEffect<{
              query: InternalType<
                ResourceState,
                ResourceParams,
                ResourceArgsParams,
                [unknown] extends [GroupIdentifier] ? false : true,
                GroupIdentifier
              >;
              mutation: InternalType<
                MutationState,
                MutationParams,
                MutationArgParams,
                [unknown] extends [MutationGroupIdentifier] ? false : true,
                MutationGroupIdentifier
              >;
            }>
          : 'error infer mutation';
      }
    : 'never2';
};

type SpecificCraftQueryOutputs<
  ResourceName extends string,
  ResourceState extends object | undefined,
  ResourceParams,
  ResourceArgsParams,
  IsMethod,
  SourceParams,
  GroupIdentifier,
  InsertionsOutputs,
> = PartialContext<{
  props: {
    [key in `${ResourceName & string}`]: QueryOutput<
      ResourceState,
      ResourceArgsParams,
      ResourceParams,
      SourceParams,
      GroupIdentifier,
      InsertionsOutputs
    >;
  };
  _query: {
    [key in ResourceName & string]: QueryOutput<
      ResourceState,
      ResourceArgsParams,
      ResourceParams,
      SourceParams,
      GroupIdentifier,
      InsertionsOutputs
    >;
  };
}>;

type CraftQueryOutputs<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  ResourceName extends string,
  ResourceState extends object | undefined,
  ResourceParams,
  ResourceArgsParams,
  IsMethod,
  SourceParams,
  GroupIdentifier,
  InsertionsOutputs,
> = CraftFactoryUtility<
  Context,
  StoreConfig,
  SpecificCraftQueryOutputs<
    ResourceName,
    ResourceState,
    ResourceParams,
    ResourceArgsParams,
    IsMethod,
    SourceParams,
    GroupIdentifier,
    InsertionsOutputs
  >
>;

export function craftQuery<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  const ResourceName extends string,
  ResourceState extends object | undefined,
  ResourceParams,
  ResourceArgsParams,
  InsertionsOutputs,
  IsMethod,
  SourceParams,
  GroupIdentifier,
>(
  resourceName: ResourceName,
  queryFactory: (
    context: CraftFactoryEntries<Context> & {
      INSERT_CONFIG: {
        storeName: StoreConfig['name'];
        key: NoInfer<ResourceName>;
      };
    },
  ) => QueryOutput<
    ResourceState,
    ResourceArgsParams,
    ResourceParams,
    SourceParams,
    GroupIdentifier,
    InsertionsOutputs
  >,
  queryOptions?: QueryOptions<
    NoInfer<Context>,
    NoInfer<ResourceState>,
    NoInfer<ResourceParams>,
    NoInfer<GroupIdentifier>,
    NoInfer<ResourceArgsParams>
  >,
): CraftQueryOutputs<
  Context,
  StoreConfig,
  ResourceName,
  NoInfer<ResourceState>,
  ResourceParams,
  ResourceArgsParams,
  IsMethod,
  SourceParams,
  GroupIdentifier,
  InsertionsOutputs
> {
  return () => (contextData, injector, storeConfig) => {
    const queryFactoryContext = craftFactoryEntries(contextData);
    const queryRef = queryFactory({
      ...queryFactoryContext,
      INSERT_CONFIG: {
        storeName: storeConfig.name,
        key: resourceName,
      },
    }) as QueryRef<
      ResourceState,
      ResourceArgsParams,
      ResourceParams,
      InsertionsOutputs,
      IsMethod,
      SourceParams,
      GroupIdentifier
    >;
    const mutationsConfigEffect = Object.entries(
      (queryOptions?.on ?? {}) as Record<string, QueryDeclarativeEffect<any>>,
    );
    const context = contextData.context;

    const resourceTarget = (
      '_resourceById' in queryRef ? queryRef._resourceById : queryRef
    ) as
      | ResourceByIdRef<string, ResourceState, ResourceParams>
      | ResourceRef<ResourceState>;

    // todo remove
    handleQueryResourceMutationEffects<
      Context,
      ResourceName,
      ResourceState,
      ResourceParams,
      ResourceArgsParams,
      IsMethod,
      SourceParams,
      GroupIdentifier & string,
      InsertionsOutputs
    >(
      mutationsConfigEffect,
      context as unknown as Context,
      resourceName,
      resourceTarget,
      injector,
    );

    return partialContext({
      props: {
        [`${resourceName as ResourceName}`]: Object.assign(
          queryRef,
        ) as MergeObject<
          ResourceByIdRef<
            GroupIdentifier & string,
            ResourceState,
            ResourceParams
          >,
          InsertionsOutputs
        >,
      },
      _query: {
        [resourceName as ResourceName]: queryRef,
      },
    }) as SpecificCraftQueryOutputs<
      ResourceName,
      ResourceState,
      ResourceParams,
      ResourceArgsParams,
      IsMethod,
      SourceParams,
      GroupIdentifier,
      InsertionsOutputs
    >;
  };
}

function handleQueryResourceMutationEffects<
  Context extends ContextConstraints,
  ResourceName extends string,
  ResourceState,
  ResourceParams,
  ResourceArgsParams,
  IsMethod,
  SourceParams,
  GroupIdentifier extends string,
  InsertionsOutputs,
>(
  mutationsConfigEffect: [string, QueryDeclarativeEffect<any>][],
  context: Context,
  resourceName: ResourceName,
  queryResourceTarget:
    | ResourceByIdRef<string, ResourceState, ResourceParams>
    | ResourceRef<ResourceState>,
  _injector: Injector,
) {
  return {
    ...(mutationsConfigEffect.length &&
      mutationsConfigEffect.reduce(
        (acc, [mutationName, mutationEffectOptions]) => {
          const formattedMutationName = mutationName
            .replace('Mutation', '')
            .replace('ById', '');
          const mutationTargeted = (
            context._mutation as Record<
              string,
              | ResourceLikeMutationRef<
                  any,
                  unknown,
                  unknown,
                  unknown,
                  unknown,
                  unknown
                >
              | ResourceByIdLikeMutationRef<
                  any,
                  unknown,
                  unknown,
                  unknown,
                  unknown,
                  unknown,
                  string | number
                >
            >
          )[formattedMutationName];
          if (!(mutationTargeted.type === 'resourceByGroupLike')) {
            const mutationResource = mutationTargeted;
            return {
              ...acc,
              [`_on${mutationName}${resourceName}QueryEffect`]: effect(() => {
                const mutationStatus = mutationResource.status();
                const mutationParamsSrc = mutationTargeted.resourceParamsSrc;
                // use to track the value of the mutation
                const _mutationValueChanged = mutationResource.hasValue()
                  ? mutationResource.value()
                  : undefined;

                if (
                  mutationEffectOptions?.optimisticUpdate ||
                  mutationEffectOptions.update
                ) {
                  untracked(() => {
                    setAllUpdatesFromMutationOnQueryValue({
                      mutationStatus,
                      queryResourceTarget,
                      mutationEffectOptions,
                      mutationResource:
                        mutationResource as unknown as ResourceRef<any>,
                      mutationParamsSrc,
                      mutationIdentifier: undefined,
                      mutationResources: undefined,
                    });
                  });
                }
                const reloadCConfig = mutationEffectOptions.reload;
                if (reloadCConfig) {
                  untracked(() => {
                    triggerQueryReloadOnMutationStatusChange({
                      mutationStatus,
                      queryResourceTarget,
                      mutationEffectOptions,
                      mutationResource:
                        mutationResource as unknown as ResourceRef<any>,
                      mutationParamsSrc,
                      reloadCConfig,
                      mutationIdentifier: undefined,
                      mutationResources: undefined,
                    });
                  });
                }
                if (
                  mutationEffectOptions.optimisticPatch ||
                  mutationEffectOptions.patch
                ) {
                  untracked(() => {
                    setAllPatchFromMutationOnQueryValue({
                      mutationStatus,
                      //@ts-expect-error not understand from where the error come from
                      queryResourceTarget: queryResourceTarget,
                      mutationEffectOptions: mutationEffectOptions as any,
                      mutationResource:
                        mutationResource as unknown as ResourceRef<any>,
                      mutationParamsSrc,
                      mutationIdentifier: undefined,
                      mutationResources: undefined,
                    });
                  });
                }
              }),
            };
          }
          const mutationResources = mutationTargeted._resourceById;

          const newMutationResourceRefForNestedEffect = linkedSignal<
            ResourceByIdRef<string, any, unknown>,
            { newKeys: GroupIdentifier[] } | undefined
          >({
            //@ts-expect-error I do not understand why it is not satisfies
            source: mutationResources,
            computation: (currentSource, previous) => {
              if (!currentSource || !Object.keys(currentSource).length) {
                return undefined;
              }

              const currentKeys = Object.keys(
                currentSource,
              ) as GroupIdentifier[];
              const previousKeys = Object.keys(
                previous?.source || {},
              ) as GroupIdentifier[];

              // Find keys that exist in current but not in previous
              const newKeys = currentKeys.filter(
                (key) => !previousKeys.includes(key),
              );

              return newKeys.length > 0 ? { newKeys } : previous?.value;
            },
          }) as unknown as Signal<{ newKeys: GroupIdentifier[] } | undefined>;

          return {
            ...acc,
            [`_on${mutationName}${resourceName}QueryEffect`]: effect(() => {
              if (!newMutationResourceRefForNestedEffect()?.newKeys) {
                return;
              }
              newMutationResourceRefForNestedEffect()?.newKeys.forEach(
                (mutationIdentifier) => {
                  nestedEffect(_injector, () => {
                    const mutationResource =
                      mutationResources()[mutationIdentifier];

                    if (!mutationResource) {
                      return;
                    }
                    const mutationStatus = mutationResource.status();
                    const mutationParamsSrc =
                      mutationTargeted.resourceParamsSrc;
                    // use to track the value of the mutation
                    const _mutationValueChanged = mutationResource.hasValue()
                      ? mutationResource.value()
                      : undefined;

                    if (
                      typeof mutationParamsSrc === 'function' &&
                      mutationParamsSrc()
                    ) {
                      // ! keep this check, it is used to track mutationParamsSrc, otherwise it does not works
                    }
                    if (
                      mutationEffectOptions?.optimisticUpdate ||
                      mutationEffectOptions.update
                    ) {
                      untracked(() => {
                        setAllUpdatesFromMutationOnQueryValue({
                          mutationStatus,
                          queryResourceTarget,
                          mutationEffectOptions,
                          mutationResource,
                          mutationParamsSrc,
                          mutationIdentifier,
                          mutationResources,
                        });
                      });
                    }
                    const reloadCConfig = mutationEffectOptions.reload;
                    if (reloadCConfig) {
                      untracked(() => {
                        triggerQueryReloadOnMutationStatusChange({
                          mutationStatus,
                          queryResourceTarget,
                          mutationEffectOptions,
                          mutationResource,
                          mutationParamsSrc,
                          reloadCConfig,
                          mutationIdentifier,
                          mutationResources,
                        });
                      });
                    }
                    if (
                      mutationEffectOptions.optimisticPatch ||
                      mutationEffectOptions.patch
                    ) {
                      untracked(() => {
                        setAllPatchFromMutationOnQueryValue({
                          mutationStatus,
                          queryResourceTarget,
                          mutationEffectOptions,
                          mutationResource:
                            mutationResource as unknown as ResourceRef<any>,
                          mutationParamsSrc,
                          mutationIdentifier: mutationIdentifier,
                          mutationResources: mutationTargeted,
                        });
                      });
                    }
                  });
                },
              );
            }),
          };
        },
        {} as Record<`_on${string}${ResourceName}QueryEffect`, EffectRef>,
      )),
  };
}
