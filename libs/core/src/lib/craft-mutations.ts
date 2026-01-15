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
import { MutationRef } from './mutation';

type SpecificCraftMutationsOutputs<Mutations extends {}> = PartialContext<{
  props: {
    [key in keyof Mutations]: Prettify<Omit<Mutations[key], 'mutate'>>;
  };
  methods: FilterMethodsBoundToSources<
    Mutations,
    UnionToTuple<keyof Mutations>,
    'mutate',
    'mutate'
  >;
  _mutation: {
    [key in keyof Mutations]: Mutations[key];
  };
}>;

type CraftMutationsOutputs<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  Mutations extends {},
> = CraftFactoryUtility<
  Context,
  StoreConfig,
  SpecificCraftMutationsOutputs<Mutations>
>;

export function craftMutations<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  Mutations extends {
    [key: string]: {
      kind: 'mutation';
    };
  },
>(
  mutationsFactory: (context: CraftFactoryEntries<Context>) => Mutations,
): CraftMutationsOutputs<Context, StoreConfig, Mutations> {
  return (_cloudProxy) => (contextData) => {
    const mutations = mutationsFactory(
      craftFactoryEntries(contextData),
    ) as unknown as Record<
      string,
      MutationRef<unknown, unknown, unknown, unknown, unknown, unknown, unknown>
    >;

    const { methods, resourceRefs } = Object.entries(mutations ?? {}).reduce(
      (acc, [methodName, mutationRef]) => {
        const methodValue =
          'mutate' in mutationRef ? mutationRef.mutate : undefined;
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
            'mutate' | 'source'
          >
        >;
        methods: Record<string, Function>;
      },
    );

    return partialContext({
      props: resourceRefs,
      methods,
      _mutation: resourceRefs,
    }) as unknown as SpecificCraftMutationsOutputs<Mutations>;
  };
}
