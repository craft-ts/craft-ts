import { ResourceStatus, Signal, WritableSignal } from '@angular/core';
import {
  CustomReloadOnSpecificMutationStatus,
  FilterQueryById,
  PatchQueryFn,
  PatchMutationQuery,
  QueryAndMutationRecordConstraints,
  ReloadQueriesConfig,
} from './util/types/shared.type';
import { ResourceByIdRef } from './resource-by-id';
import {
  getNestedStateValue,
  createNestedStateUpdate,
} from './util/update-state.util';
import { MergeObjects } from './util//types/util.type';
import {
  ResourceByIdLikeMutationRef,
  ResourceLikeMutationRef,
} from './mutation';
import { CraftResourceRef } from './util/craft-resource-ref';

export interface QueryParamNavigationOptions {
  queryParamsHandling?: 'merge' | 'preserve' | '';
  onSameUrlNavigation?: 'reload' | 'ignore';
  replaceUrl?: boolean;
  skipLocationChange?: boolean;
}

export type MutationResourceRefHelper<
  QueryAndMutationRecord extends QueryAndMutationRecordConstraints,
> = ResourceLikeMutationRef<
  QueryAndMutationRecord['mutation']['state'],
  QueryAndMutationRecord['mutation']['params'],
  QueryAndMutationRecord['mutation']['isMethod'],
  QueryAndMutationRecord['mutation']['args'],
  QueryAndMutationRecord['mutation']['sourceParams'],
  QueryAndMutationRecord['mutation']['insertions']
>;

export type MutationResourceByIdRefHelper<
  QueryAndMutationRecord extends QueryAndMutationRecordConstraints,
> = ResourceByIdLikeMutationRef<
  QueryAndMutationRecord['mutation']['state'],
  QueryAndMutationRecord['mutation']['params'],
  QueryAndMutationRecord['mutation']['isMethod'],
  QueryAndMutationRecord['mutation']['args'],
  QueryAndMutationRecord['mutation']['sourceParams'],
  QueryAndMutationRecord['mutation']['insertions'],
  QueryAndMutationRecord['mutation']['groupIdentifier']
>;

type UpdateData<
  QueryAndMutationRecord extends QueryAndMutationRecordConstraints,
> = MergeObjects<
  [
    {
      queryResource: CraftResourceRef<
        QueryAndMutationRecord['query']['state'],
        QueryAndMutationRecord['query']['params']
      >;
      mutationResource: CraftResourceRef<
        NoInfer<QueryAndMutationRecord['mutation']['state']>,
        NoInfer<QueryAndMutationRecord['mutation']['params']>
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

export type QueryDeclarativeEffect<
  QueryAndMutationRecord extends QueryAndMutationRecordConstraints,
> = MergeObjects<
  [
    {
      /**
       * Run when the mutation is in loading state.
       */
      optimisticUpdate?: (
        data: UpdateData<QueryAndMutationRecord> & {
          testData: QueryAndMutationRecord['query']['groupIdentifier'];
        },
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

export function triggerQueryReloadFromMutationChange<
  QueryAndMutationRecord extends QueryAndMutationRecordConstraints,
>({
  reload,
  mutationStatus,
  queryResource,
  mutationResource,
  mutationParamsSrc,
  queryIdentifier,
  queryResources,
  mutationIdentifier,
  mutationResources,
}: {
  reload: ReloadQueriesConfig<QueryAndMutationRecord>;
  mutationStatus: string;
  queryResource: CraftResourceRef<
    QueryAndMutationRecord['query']['state'],
    QueryAndMutationRecord['query']['params']
  >;
  queryResources:
    | ResourceByIdRef<
        string,
        QueryAndMutationRecord['query']['state'],
        QueryAndMutationRecord['query']['params']
      >
    | undefined;
  mutationResource: CraftResourceRef<any, any>;
  mutationParamsSrc: Signal<
    QueryAndMutationRecord['mutation']['params'] | undefined
  >;
  queryIdentifier: QueryAndMutationRecord['query']['groupIdentifier'];
  mutationIdentifier: QueryAndMutationRecord['mutation']['groupIdentifier'];
  mutationResources: ResourceByIdRef<string, any, unknown> | undefined;
}) {
  const statusMappings = {
    onMutationError: 'error',
    onMutationResolved: 'resolved',
    onMutationLoading: 'loading',
  };

  Object.entries(reload).forEach(([reloadType, reloadConfig]) => {
    const expectedStatus =
      statusMappings[reloadType as keyof typeof statusMappings];

    if (expectedStatus && mutationStatus === expectedStatus) {
      if (typeof reloadConfig === 'function') {
        if (
          reloadConfig({
            queryResource,
            mutationResource,
            //@ts-expect-error the mutationParamsSrc depends if fromResourceById is used, this typing part can be improved
            mutationParams: mutationParamsSrc(mutationResource),
            queryIdentifier,
            mutationIdentifier,
            mutationResources,
            queryResources,
          })
        ) {
          queryResource.reload();
        }
      } else if (reloadConfig) {
        queryResource.reload();
      }
    }
  });
}

export function triggerQueryReloadOnMutationStatusChange<
  QueryAndMutationRecord extends QueryAndMutationRecordConstraints,
>({
  mutationStatus,
  queryResourceTarget,
  mutationEffectOptions,
  mutationResource,
  mutationParamsSrc,
  reloadCConfig,
  mutationIdentifier,
  mutationResources,
}: {
  mutationStatus: string;
  queryResourceTarget:
    | ResourceByIdRef<
        string,
        QueryAndMutationRecord['query']['state'],
        QueryAndMutationRecord['query']['params']
      >
    | CraftResourceRef<
        QueryAndMutationRecord['query']['state'],
        QueryAndMutationRecord['query']['params']
      >;
  mutationEffectOptions: QueryDeclarativeEffect<QueryAndMutationRecord>;
  mutationResource: CraftResourceRef<any, any>;
  mutationParamsSrc: Signal<QueryAndMutationRecord['mutation']['params']>;
  reloadCConfig: {
    onMutationError?:
      | boolean
      | CustomReloadOnSpecificMutationStatus<QueryAndMutationRecord>;
    onMutationResolved?:
      | boolean
      | CustomReloadOnSpecificMutationStatus<QueryAndMutationRecord>;
    onMutationLoading?:
      | boolean
      | CustomReloadOnSpecificMutationStatus<QueryAndMutationRecord>;
  };
  mutationIdentifier:
    | QueryAndMutationRecord['mutation']['groupIdentifier']
    | undefined;
  mutationResources:
    | ResourceByIdRef<
        string,
        QueryAndMutationRecord['mutation']['state'],
        QueryAndMutationRecord['mutation']['params']
      >
    | undefined;
}) {
  if (
    (['error', 'loading', 'resolved'] satisfies ResourceStatus[]).includes(
      mutationStatus as any,
    )
  ) {
    if ('hasValue' in queryResourceTarget) {
      const queryResource = queryResourceTarget;
      triggerQueryReloadFromMutationChange({
        reload: reloadCConfig,
        mutationStatus,
        queryResource,
        mutationResource,
        mutationParamsSrc,
        queryIdentifier: undefined,
        mutationIdentifier,
        mutationResources,
        queryResources: undefined,
      });
      return;
    }
    const queryResourcesById = queryResourceTarget as ResourceByIdRef<
      string,
      QueryAndMutationRecord['query']['state'],
      QueryAndMutationRecord['query']['params']
    >;
    Object.entries(
      queryResourcesById() as Record<string, CraftResourceRef<any, any>>,
    )
      .filter(([queryIdentifier, queryResource]) => {
        return (
          mutationEffectOptions as {
            filter: FilterQueryById<QueryAndMutationRecord>;
          }
        ).filter({
          queryResource,
          mutationResource,
          //@ts-expect-error the mutationParamsSrc depends if fromResourceById is used, this typing part can be improved
          mutationParams: mutationParamsSrc(mutationResource),
          queryIdentifier,
          queryResources: queryResourceTarget,
          mutationIdentifier,
          mutationResources,
        } as any);
      })
      .forEach(([queryIdentifier, queryResource]) => {
        triggerQueryReloadFromMutationChange({
          reload: reloadCConfig,
          mutationStatus,
          queryResource,
          mutationResource,
          mutationParamsSrc,
          queryIdentifier,
          mutationIdentifier,
          mutationResources,
          queryResources: queryResourceTarget,
        });
      });
  }
}

export function setAllPatchFromMutationOnQueryValue<
  QueryAndMutationRecord extends QueryAndMutationRecordConstraints,
>({
  mutationStatus,
  queryResourceTarget,
  mutationEffectOptions,
  mutationResource,
  mutationParamsSrc,
  mutationIdentifier,
  mutationResources,
}: {
  mutationStatus: string;
  queryResourceTarget:
    | ResourceByIdRef<
        string,
        QueryAndMutationRecord['query']['state'],
        QueryAndMutationRecord['query']['params']
      >
    | CraftResourceRef<
        QueryAndMutationRecord['query']['state'],
        QueryAndMutationRecord['query']['params']
      >;
  mutationEffectOptions: QueryDeclarativeEffect<QueryAndMutationRecord>;
  mutationResource: CraftResourceRef<any, any>;
  mutationParamsSrc: Signal<QueryAndMutationRecord['mutation']['params']>;
  mutationIdentifier:
    | QueryAndMutationRecord['mutation']['groupIdentifier']
    | undefined;
  mutationResources:
    | MutationResourceByIdRefHelper<QueryAndMutationRecord>
    | undefined;
}) {
  if (mutationStatus !== 'loading' && mutationStatus !== 'resolved') {
    return;
  }
  const patchTarget =
    mutationStatus === 'loading'
      ? mutationEffectOptions.optimisticPatch
      : mutationEffectOptions.patch;
  if (!patchTarget) {
    return;
  }
  if ('hasValue' in queryResourceTarget) {
    const queryResource = queryResourceTarget;
    Object.entries(
      patchTarget as Record<string, PatchQueryFn<any, any>>,
    ).forEach(([path, optimisticPatch]) => {
      const queryValue = queryResource.hasValue()
        ? queryResource.value()
        : undefined;
      const optimisticValue = optimisticPatch({
        mutationResource,
        queryResource,
        queryResources: undefined,
        queryIdentifier: undefined,
        //@ts-expect-error the mutationParamsSrc depends if fromResourceById is used, this typing part can be improved
        mutationParams: mutationParamsSrc(mutationResource),
        targetedState: getNestedStateValue({
          state: queryValue,
          keysPath: path.split('.'),
        }),
        mutationIdentifier,
        mutationResources,
      });
      const updatedValue = createNestedStateUpdate({
        state: queryValue,
        keysPath: path.split('.'),
        value: optimisticValue,
      });
      queryResource.set(updatedValue);
    });
    return;
  }
  const queryResourcesById = queryResourceTarget as ResourceByIdRef<
    string,
    QueryAndMutationRecord['query']['state'],
    QueryAndMutationRecord['query']['params']
  >;
  Object.entries(
    queryResourcesById() as Record<string, CraftResourceRef<any, any>>,
  )
    .filter(([queryIdentifier, queryResource]) =>
      (
        mutationEffectOptions as {
          filter: FilterQueryById<QueryAndMutationRecord>;
        }
      ).filter({
        queryResource,
        mutationResource,
        //@ts-expect-error the mutationParamsSrc depends if fromResourceById is used, this typing part can be improved
        mutationParams: mutationParamsSrc(mutationResource),
        queryIdentifier,
        queryResources: queryResourcesById,
        mutationIdentifier,
        mutationResources,
      } as any),
    )
    .forEach(([queryIdentifier, queryResource]) => {
      Object.entries(
        patchTarget as Record<string, PatchQueryFn<any, any>>,
      ).forEach(([path, patch]) => {
        const queryValue = queryResource.hasValue()
          ? queryResource.value()
          : undefined;
        const optimisticValue = patch({
          mutationResource,
          queryResource,
          queryResources: queryResourcesById,
          queryIdentifier,
          //@ts-expect-error the mutationParamsSrc depends if fromResourceById is used, this typing part can be improved
          mutationParams: mutationParamsSrc(mutationResource),
          targetedState: getNestedStateValue({
            state: queryValue,
            keysPath: path.split('.'),
          }),
          mutationIdentifier,
          mutationResources,
        });
        const updatedValue = createNestedStateUpdate({
          state: queryValue,
          keysPath: path.split('.'),
          value: optimisticValue,
        });
        queryResource.set(updatedValue);
      });
    });
}

export function setAllUpdatesFromMutationOnQueryValue<
  QueryAndMutationRecord extends QueryAndMutationRecordConstraints,
>({
  mutationStatus,
  queryResourceTarget,
  mutationEffectOptions,
  mutationResource,
  mutationParamsSrc,
  mutationIdentifier,
  mutationResources,
}: {
  mutationStatus: string;
  queryResourceTarget:
    | ResourceByIdRef<
        string,
        QueryAndMutationRecord['query']['state'],
        QueryAndMutationRecord['query']['params']
      >
    | CraftResourceRef<
        QueryAndMutationRecord['query']['state'],
        QueryAndMutationRecord['query']['params']
      >;
  mutationEffectOptions: QueryDeclarativeEffect<QueryAndMutationRecord>;
  mutationResource: CraftResourceRef<any, any> | undefined;
  mutationParamsSrc: Signal<QueryAndMutationRecord['mutation']['params']>;
  mutationIdentifier:
    | QueryAndMutationRecord['mutation']['groupIdentifier']
    | undefined;
  mutationResources:
    | ResourceByIdRef<
        string,
        QueryAndMutationRecord['mutation']['state'],
        QueryAndMutationRecord['mutation']['params']
      >
    | undefined;
}) {
  if (mutationStatus !== 'loading' && mutationStatus !== 'resolved') {
    return;
  }
  const updateTarget =
    mutationStatus === 'loading'
      ? mutationEffectOptions.optimisticUpdate
      : mutationEffectOptions.update;
  if (!updateTarget) {
    return;
  }

  if ('hasValue' in queryResourceTarget) {
    const queryResource = queryResourceTarget;
    const updatedValue = updateTarget({
      queryResource,
      mutationResource,
      //@ts-expect-error the mutationParamsSrc depends if fromResourceById is used, this typing part can be improved
      mutationParams: mutationParamsSrc(mutationResource),
      queryIdentifier: undefined,
      queryResources: undefined,
      mutationIdentifier,
      mutationResources,
    } as any);
    queryResource.set(updatedValue);
    return;
  }
  const queryResourceById = queryResourceTarget as ResourceByIdRef<
    string,
    QueryAndMutationRecord['query']['state'],
    QueryAndMutationRecord['query']['params']
  >;
  Object.entries(
    queryResourceById() as Record<string, CraftResourceRef<any, any>>,
  )
    .filter(([queryIdentifier, queryResource]) =>
      (
        mutationEffectOptions as {
          filter: FilterQueryById<QueryAndMutationRecord>;
        }
      ).filter({
        queryResource,
        mutationResource,
        //@ts-expect-error the mutationParamsSrc depends if fromResourceById is used, this typing part can be improved
        mutationParams: mutationParamsSrc(mutationResource),
        queryIdentifier,
        queryResources: queryResourceTarget,
        mutationIdentifier,
        mutationResources,
      } as any),
    )
    .forEach(([queryIdentifier, queryResource]) => {
      const updatedValue = updateTarget({
        queryResource,
        mutationResource,
        //@ts-expect-error the mutationParamsSrc depends if fromResourceById is used, this typing part can be improved
        mutationParams: mutationParamsSrc(mutationResource),
        queryIdentifier,
        queryResources: queryResourceTarget,
        mutationIdentifier,
        mutationResources,
      } as any);
      queryResource.set(updatedValue);
    });
}

export type InsertionParams<
  ResourceState extends object | undefined,
  ResourceParams,
  PreviousInsertionsOutputs,
> = {
  resource: CraftResourceRef<ResourceState, ResourceParams>;
  resourceParamsSrc: WritableSignal<ResourceParams>;
  insertions: keyof PreviousInsertionsOutputs extends string
    ? PreviousInsertionsOutputs
    : never;
  // 👇 Seems required for insertLocalStoragePersister, otherwise TS says they can be missing
  resourceById: never;
  identifier: never;
};

export type InsertionsFactory<
  ResourceState extends object | undefined,
  ResourceParams,
  InsertsOutputs,
  PreviousInsertionsOutputs = {},
> = (
  context: InsertionParams<
    ResourceState,
    ResourceParams,
    PreviousInsertionsOutputs
  >,
) => InsertsOutputs;

export type InsertionByIdParams<
  GroupIdentifier extends string,
  ResourceState extends object | undefined,
  ResourceParams,
  PreviousInsertionsOutputs,
> = {
  resourceById: ResourceByIdRef<GroupIdentifier, ResourceState, ResourceParams>;
  resourceParamsSrc: WritableSignal<ResourceParams | undefined>;
  identifier: (params: NonNullable<ResourceParams>) => GroupIdentifier;
  insertions: keyof PreviousInsertionsOutputs extends string
    ? PreviousInsertionsOutputs
    : never;
};

export type InsertionStateFactoryContext<StateType, PreviousInsertionsOutputs> =
  {
    state: Signal<StateType>;
    set: (newState: StateType) => StateType;
    update: (updateFn: (currentState: StateType) => StateType) => StateType;
    insertions: keyof PreviousInsertionsOutputs extends string
      ? PreviousInsertionsOutputs
      : never;
  };

export type QueryParamMethods<QueryParamsState> = {
  patch: (
    params: Partial<QueryParamsState>,
    options?: QueryParamNavigationOptions,
  ) => void;
  reset: (options?: QueryParamNavigationOptions) => void;
  set: (
    params: QueryParamsState,
    options?: QueryParamNavigationOptions,
  ) => void;
  update: (
    updateFn: (currentParams: QueryParamsState) => QueryParamsState,
    options?: QueryParamNavigationOptions,
  ) => void;
};

export type InsertionQueryParamsFactoryContext<
  QueryParamsType,
  PreviousInsertionsOutputs,
  QueryParamsState,
> = QueryParamMethods<QueryParamsState> & {
  state: Signal<QueryParamsState>;
  config: QueryParamsType;
  insertions: keyof PreviousInsertionsOutputs extends string
    ? PreviousInsertionsOutputs
    : never;
};

export type InsertionsByIdFactory<
  ResourceState extends object | undefined,
  ResourceParams,
  GroupIdentifier extends string,
  InsertionsOutputs,
  PreviousInsertionsOutputs = {},
> = (
  context: InsertionByIdParams<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    PreviousInsertionsOutputs
  >,
) => InsertionsOutputs;

export type InsertionResourceFactoryContext<
  GroupIdentifier,
  ResourceState extends object | undefined,
  ResourceParams,
  PreviousInsertionsOutputs,
> = [unknown] extends [GroupIdentifier]
  ? InsertionParams<ResourceState, ResourceParams, PreviousInsertionsOutputs>
  : InsertionByIdParams<
      GroupIdentifier & string,
      ResourceState,
      ResourceParams,
      PreviousInsertionsOutputs
    >;
export type InsertionsResourcesFactory<
  GroupIdentifier,
  ResourceState extends object | undefined,
  ResourceParams,
  InsertionsOutputs,
  PreviousInsertionsOutputs = {},
> = (
  context: InsertionResourceFactoryContext<
    GroupIdentifier,
    ResourceState,
    ResourceParams,
    PreviousInsertionsOutputs
  >,
) => InsertionsOutputs;

export type InsertionsStateFactory<
  State,
  InsertionsOutputs,
  PreviousInsertionsOutputs = {},
> = (
  context: InsertionStateFactoryContext<State, PreviousInsertionsOutputs>,
) => InsertionsOutputs;

export type InsertionsQueryParamsFactory<
  State,
  QueryParamsType,
  InsertionsOutputs,
  PreviousInsertionsOutputs = {},
> = (
  context: InsertionQueryParamsFactoryContext<
    QueryParamsType,
    PreviousInsertionsOutputs,
    State
  >,
) => InsertionsOutputs;

export type DefaultInsertionByIdParams = InsertionByIdParams<
  string,
  {},
  unknown,
  {}
>;

export type DefaultInsertionParams = InsertionParams<{}, unknown, unknown>;
