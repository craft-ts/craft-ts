import { WritableSignal } from '@angular/core';
import {
  ResourceByIdLikeMutationRef,
  ResourceLikeMutationRef,
} from './mutation';
import { ResourceByIdLikeQueryRef, ResourceLikeQueryRef } from './query';
import { InsertionParams, QueryDeclarativeEffect } from './query.core';
import { ResourceByIdRef } from './resource-by-id';
import { reactOnMutationEffect } from './util/react-on-mutation-effect';
import { InternalType } from './util/types/util.type';

export function insertReactOnMutation<
  QueryResourceState extends object | undefined,
  QueryResourceParams,
  QueryResourceArgsParams,
  QueryIsMethod extends boolean,
  QuerySourceParams,
  QueryGroupIdentifier,
  QueryInsertions,
  MutationResourceState,
  MutationResourceParams,
  MutationResourceArgsParams,
  MutationIsMethod,
  MutationSourceParams,
  MutationGroupIdentifier,
  MutationInsertions,
>(
  mutation:
    | ResourceLikeMutationRef<
        MutationResourceState,
        MutationResourceParams,
        MutationIsMethod,
        MutationResourceArgsParams,
        MutationSourceParams,
        MutationInsertions
      >
    | ResourceByIdLikeMutationRef<
        MutationResourceState,
        MutationResourceParams,
        MutationIsMethod,
        MutationResourceArgsParams,
        MutationSourceParams,
        MutationInsertions,
        MutationGroupIdentifier
      >,
  mutationEffectOptions: QueryDeclarativeEffect<{
    query: InternalType<
      NoInfer<QueryResourceState>,
      NoInfer<QueryResourceParams>,
      NoInfer<QueryResourceArgsParams>,
      [unknown] extends [NoInfer<QueryGroupIdentifier>] ? false : true,
      NoInfer<QueryIsMethod>,
      NoInfer<QueryInsertions>,
      NoInfer<QueryGroupIdentifier>,
      NoInfer<QuerySourceParams>
    >;
    mutation: InternalType<
      NoInfer<MutationResourceState>,
      NoInfer<MutationResourceParams>,
      NoInfer<MutationResourceArgsParams>,
      [unknown] extends [MutationGroupIdentifier] ? false : true,
      NoInfer<MutationIsMethod>,
      NoInfer<MutationInsertions>,
      NoInfer<MutationGroupIdentifier>,
      NoInfer<MutationSourceParams>
    >;
  }>,
) {
  return (
    context:
      | InsertionParams<
          QueryResourceState,
          QueryResourceParams,
          QueryInsertions
        >
      | {
          // ! avoid to use InsertionByIdParams it is broking the typing inference
          resourceById: ResourceByIdRef<
            QueryGroupIdentifier & string,
            QueryResourceState,
            QueryResourceParams
          >;
          resourceParamsSrc: WritableSignal<QueryResourceParams | undefined>;
          identifier: (
            params: NonNullable<QueryResourceParams>,
          ) => QueryGroupIdentifier;
          insertions: keyof QueryInsertions extends string
            ? QueryInsertions
            : never;
        },
  ) => {
    return reactOnMutationEffect(
      {
        queryTargeted: ('resource' in context
          ? context.resource
          : context.resourceById) as unknown as
          | ResourceLikeQueryRef<
              QueryResourceState,
              QueryResourceParams,
              QueryIsMethod,
              QueryResourceArgsParams,
              QuerySourceParams,
              QueryInsertions
            >
          | ResourceByIdLikeQueryRef<
              QueryResourceState,
              QueryResourceParams,
              QueryIsMethod,
              QueryResourceArgsParams,
              QuerySourceParams,
              QueryInsertions,
              QueryGroupIdentifier
            >,
        mutationTargeted: mutation,
      },
      mutationEffectOptions,
    );
  };
}
