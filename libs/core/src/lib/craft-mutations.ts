import {
  ContextConstraints,
  craftFactoryEntries,
  CraftFactoryEntries,
  CraftFactoryUtility,
  PartialContext,
  partialContext,
  StoreConfigConstraints,
} from './craft';
import { UnionToTuple, Prettify } from './util/util.type';
import { capitalize } from './util/util';
import { FilterMethodsBoundToSources } from './util/util.type';
import { MutationOutput, MutationRef } from './mutation';
import { ResourceByIdRef } from './resource-by-id';
import { WritableSignal } from '@angular/core';
import { ResourceMethod } from './util/types/shared.type';

export type MutationByIdRef<
  GroupIdentifier extends string,
  ResourceState,
  ResourceParams,
  ParamsArgs,
  InsertionsOutput
> = {
  resourceById: ResourceByIdRef<GroupIdentifier, ResourceState, ResourceParams>;
  resourceParamsSrc: WritableSignal<ResourceParams | undefined>;
  method: ResourceMethod<ParamsArgs, ResourceParams> | undefined;
  insertionsOutputs: InsertionsOutput;
};

type SpecificCraftMutationsOutputs<Mutations extends {}> = PartialContext<{
  props: {
    [key in keyof Mutations]: Prettify<Omit<Mutations[key], 'method'>>;
  };
  methods: FilterMethodsBoundToSources<
    Mutations,
    UnionToTuple<keyof Mutations>,
    'mutate'
  >;
  _mutation: {
    [key in keyof Mutations]: Mutations[key];
  };
}>;

type CraftMutationsOutputs<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  Mutations extends {}
> = CraftFactoryUtility<
  Context,
  StoreConfig,
  SpecificCraftMutationsOutputs<Mutations>
>;

export function craftMutations<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  Mutations extends Record<
    string,
    MutationOutput<object, unknown, unknown, unknown, unknown, any>
  >
>(
  mutationsFactory: (context: CraftFactoryEntries<Context>) => Mutations
): CraftMutationsOutputs<Context, StoreConfig, Mutations> {
  return (_cloudProxy) => (contextData) => {
    const mutations = mutationsFactory(
      craftFactoryEntries(contextData)
    ) as Record<
      string,
      MutationRef<unknown, unknown, unknown, unknown, unknown, unknown, unknown>
    >;

    const { methods, resourceRefs } = Object.entries(mutations ?? {}).reduce(
      (acc, [methodName, mutationRef]) => {
        const methodValue =
          'method' in mutationRef ? mutationRef.method : undefined;
        if (!methodValue) {
          acc.resourceRefs[methodName] = mutationRef;
          return acc;
        }
        acc.resourceRefs[methodName] = mutationRef;
        acc.methods[`mutate${capitalize(methodName)}`] =
          methodValue as Function;
        return acc;
      },
      {
        methods: {},
        resourceRefs: {},
      } as {
        resourceRefs: Record<
          string,
          Omit<
            MutationRef<
              unknown,
              unknown,
              unknown,
              unknown,
              unknown,
              unknown,
              unknown
            >,
            'method' | 'source'
          >
        >;
        methods: Record<string, Function>;
      }
    );

    return partialContext({
      props: resourceRefs,
      methods,
      _mutation: resourceRefs,
    }) as unknown as SpecificCraftMutationsOutputs<Mutations>;
  };
}
