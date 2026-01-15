import { MergeObject, MergeObjects } from './util/util.type';
import {
  ContextConstraints,
  CraftFactoryUtility,
  StoreConfigConstraints,
  PartialContext,
  craftFactoryEntries,
  partialContext,
} from './craft';
import { ResourceRef } from '@angular/core';
import { ResourceByIdRef } from './resource-by-id';
import { QueryOutput, QueryRef } from './query';
import { QueryAndMutationRecordConstraints } from './util/types/shared.type';

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

type ContextQueryEntries<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  ResourceName extends string,
> = Context['_inputs'] &
  Context['_injections'] &
  Context['_sources'] &
  Omit<Context['props'], keyof Context['_mutation']> &
  Context['_asyncMethods'] &
  Context['_mutation'] & {
    INSERT_CONFIG: {
      storeName: StoreConfig['name'];
      key: NoInfer<ResourceName>;
    };
  };

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
    context: ContextQueryEntries<Context, StoreConfig, ResourceName>,
  ) => QueryOutput<
    ResourceState,
    ResourceArgsParams,
    ResourceParams,
    SourceParams,
    GroupIdentifier,
    InsertionsOutputs
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
    } as ContextQueryEntries<Context, StoreConfig, ResourceName>) as QueryRef<
      ResourceState,
      ResourceArgsParams,
      ResourceParams,
      InsertionsOutputs,
      IsMethod,
      SourceParams,
      GroupIdentifier
    >;

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
