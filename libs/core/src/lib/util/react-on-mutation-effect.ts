import {
  ResourceRef,
  Injector,
  effect,
  untracked,
  Signal,
  inject,
  computed,
} from '../host/craft-compat';
import { craftLinkedSignal as linkedSignal } from '../host/craft-linked-signal';
import {
  ResourceLikeMutationRef,
  ResourceByIdLikeMutationRef,
} from '../mutation';
import {
  QueryDeclarativeEffect,
  setAllUpdatesFromMutationOnQueryValue,
  triggerQueryReloadOnMutationStatusChange,
  setAllPatchFromMutationOnQueryValue,
  ResourceExceptionConstraints,
} from '../query.core';
import { ResourceByIdRef } from '../resource-by-id';
import { explicitNestedEffect } from './types/util';
import { InternalType } from './types/util.type';
import { ResourceByIdLikeQueryRef, ResourceLikeQueryRef } from '../query';
import { CraftResourceRef } from './craft-resource-ref';

// todo improve internal function types
export function reactOnMutationEffect<
  QueryResourceState,
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
  MutationExceptions extends ResourceExceptionConstraints,
  QueryExceptions extends ResourceExceptionConstraints,
>(
  {
    queryTargeted,
    mutationTargeted,
  }: {
    queryTargeted:
      | ResourceLikeQueryRef<
          QueryResourceState,
          QueryResourceParams,
          QueryIsMethod,
          QueryResourceArgsParams,
          QuerySourceParams,
          QueryInsertions,
          QueryExceptions
        >
      | ResourceByIdLikeQueryRef<
          QueryResourceState,
          QueryResourceParams,
          QueryIsMethod,
          QueryResourceArgsParams,
          QuerySourceParams,
          QueryInsertions,
          QueryGroupIdentifier,
          QueryExceptions
        >;
    mutationTargeted:
      | ResourceLikeMutationRef<
          MutationResourceState,
          MutationResourceParams,
          MutationIsMethod,
          MutationResourceArgsParams,
          MutationSourceParams,
          MutationInsertions,
          MutationExceptions
        >
      | ResourceByIdLikeMutationRef<
          MutationResourceState,
          MutationResourceParams,
          MutationIsMethod,
          MutationResourceArgsParams,
          MutationSourceParams,
          MutationInsertions,
          MutationGroupIdentifier,
          MutationExceptions
        >;
  },
  mutationEffectOptions: QueryDeclarativeEffect<{
    query: InternalType<
      NoInfer<QueryResourceState>,
      NoInfer<QueryResourceParams>,
      NoInfer<QueryResourceArgsParams>,
      [unknown] extends [NoInfer<QueryGroupIdentifier>] ? false : true,
      NoInfer<QueryIsMethod>,
      NoInfer<QueryInsertions>,
      NoInfer<QueryGroupIdentifier>,
      NoInfer<QuerySourceParams>,
      NoInfer<QueryExceptions>
    >;
    mutation: InternalType<
      NoInfer<MutationResourceState>,
      NoInfer<MutationResourceParams>,
      NoInfer<MutationResourceArgsParams>,
      [unknown] extends [MutationGroupIdentifier] ? false : true,
      NoInfer<MutationIsMethod>,
      NoInfer<MutationInsertions>,
      NoInfer<MutationGroupIdentifier>,
      NoInfer<MutationSourceParams>,
      NoInfer<MutationExceptions>
    >;
  }>,
) {
  const _injector = inject(Injector);
  if (mutationTargeted.type === 'resourceLike') {
    const mutationResource = mutationTargeted;
    return effect(() => {
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
            queryResourceTarget: queryTargeted,
            mutationEffectOptions: mutationEffectOptions,
            mutationResource: mutationResource as any,
            mutationParamsSrc,
            mutationIdentifier: undefined,
            mutationResources: undefined,
          } as any);
        });
      }
      const reloadCConfig = mutationEffectOptions.reload;
      if (reloadCConfig) {
        untracked(() => {
          triggerQueryReloadOnMutationStatusChange({
            mutationStatus,
            queryResourceTarget: queryTargeted,
            mutationEffectOptions: mutationEffectOptions as any,
            mutationResource: mutationResource as unknown as ResourceRef<any>,
            mutationParamsSrc,
            reloadCConfig,
            mutationIdentifier: undefined,
            mutationResources: undefined,
          } as any);
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
            queryResourceTarget: queryTargeted,
            mutationEffectOptions: mutationEffectOptions as any,
            mutationResource: mutationResource as unknown as CraftResourceRef<
              any,
              any
            >,
            mutationParamsSrc,
            mutationIdentifier: undefined,
            mutationResources: undefined,
          });
        });
      }
    });
  }
  const mutationResources = mutationTargeted._resourceById;

  const newMutationResourceRefForNestedEffect = linkedSignal<
    ResourceByIdRef<
      MutationGroupIdentifier & string,
      MutationResourceState,
      MutationResourceParams
    >,
    { newKeys: QueryGroupIdentifier[] } | undefined
  >({
    //@ts-expect-error I do not understand why it is not satisfies
    source: mutationResources,
    injector: _injector,
    computation: (currentSource, previous) => {
      if (!currentSource || !Object.keys(currentSource).length) {
        return undefined;
      }

      const currentKeys = Object.keys(currentSource) as QueryGroupIdentifier[];
      const previousKeys = Object.keys(
        previous?.source || {},
      ) as QueryGroupIdentifier[];

      // Find keys that exist in current but not in previous
      const newKeys = currentKeys.filter((key) => !previousKeys.includes(key));

      return newKeys.length > 0 ? { newKeys } : previous?.value;
    },
  }) as unknown as Signal<{ newKeys: MutationGroupIdentifier[] } | undefined>;

  return effect(() => {
    if (!newMutationResourceRefForNestedEffect()?.newKeys) {
      return;
    }
    newMutationResourceRefForNestedEffect()?.newKeys.forEach(
      (mutationIdentifier) => {
        const mutationResource =
          mutationResources()[
            mutationIdentifier as MutationGroupIdentifier & string
          ];
        if (!mutationResource) {
          return;
        }
        const safeMutationResourceValue = computed(() =>
          mutationResource.hasValue()
            ? mutationResource.value()
            : (undefined as unknown as MutationResourceState),
        );
        explicitNestedEffect(
          _injector,
          [
            mutationResource.status,
            safeMutationResourceValue,
            mutationResource.paramSrc,
          ],
          ([mutationStatus, _value]) => {
            const mutationParamsSrc = mutationResource.paramSrc;
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
                  queryResourceTarget: queryTargeted as any,
                  mutationEffectOptions: mutationEffectOptions as any,
                  mutationResource,
                  mutationParamsSrc,
                  mutationIdentifier,
                  mutationResources:
                    mutationResources as unknown as ResourceByIdRef<
                      string,
                      any,
                      any
                    >,
                });
              });
            }
            const reloadCConfig = mutationEffectOptions.reload;
            if (reloadCConfig) {
              untracked(() => {
                triggerQueryReloadOnMutationStatusChange({
                  mutationStatus,
                  queryResourceTarget: queryTargeted,
                  mutationEffectOptions: mutationEffectOptions as any,
                  mutationResource,
                  mutationParamsSrc,
                  reloadCConfig,
                  mutationIdentifier,
                  mutationResources:
                    mutationResources as unknown as ResourceByIdRef<
                      string,
                      any,
                      any
                    >,
                } as any);
              });
            }
            if (
              mutationEffectOptions.optimisticPatch ||
              mutationEffectOptions.patch
            ) {
              untracked(() => {
                setAllPatchFromMutationOnQueryValue({
                  mutationStatus,
                  queryResourceTarget: queryTargeted as any,
                  mutationEffectOptions: mutationEffectOptions as any,
                  mutationResource:
                    mutationResource as unknown as CraftResourceRef<any, any>,
                  mutationParamsSrc,
                  mutationIdentifier: mutationIdentifier,
                  mutationResources: mutationTargeted as any,
                });
              });
            }
          },
        );
      },
    );
  });
}
