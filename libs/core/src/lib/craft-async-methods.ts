import { ResourceStatus, Signal } from '@angular/core';
import {
  ContextConstraints,
  craftFactoryEntries,
  CraftFactoryEntries,
  CraftFactoryUtility,
  PartialContext,
  partialContext,
  StoreConfigConstraints,
} from './craft';
import { ReadonlySource } from './util/source.type';
import { capitalize } from './util/util';
import {
  FilterMethodsBoundToSources,
  MergeObjects,
  Prettify,
  UnionToTuple,
} from './util/util.type';
import { ResourceByIdRef } from './resource-by-id';

type SpecificCraftAsyncMethodsOutputs<AsyncMethods extends {}> =
  PartialContext<{
    props: {
      [key in keyof AsyncMethods]: Prettify<Omit<AsyncMethods[key], 'method'>>;
    };
    methods: FilterMethodsBoundToSources<
      AsyncMethods,
      UnionToTuple<keyof AsyncMethods>,
      'method',
      'set'
    >;
    _asyncMethods: {
      [key in keyof AsyncMethods]: Prettify<Omit<AsyncMethods[key], 'method'>>;
    };
  }>;

type CraftAsyncMethodsOutputs<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  AsyncMethods extends {},
> = CraftFactoryUtility<
  Context,
  StoreConfig,
  SpecificCraftAsyncMethodsOutputs<AsyncMethods>
>;

// ! It looks like TS does not handle to expose the ResourceByIdHandler without erasing the () => ... part
export type AsyncMethodRef<
  Value,
  ArgParams,
  Params,
  Insertions,
  IsMethod,
  SourceParams,
  GroupIdentifier,
> = MergeObjects<
  [
    [unknown] extends [GroupIdentifier]
      ? {
          readonly value: Signal<Value | undefined>;
          readonly status: Signal<ResourceStatus>;
          readonly error: Signal<Error | undefined>;
          readonly isLoading: Signal<boolean>;
          hasValue(): boolean;
        }
      : {},
    Insertions,
    IsMethod extends true
      ? {
          method: (args: ArgParams) => Params;
        }
      : {
          source: ReadonlySource<SourceParams>;
        },
    [unknown] extends [GroupIdentifier]
      ? {}
      : ResourceByIdRef<GroupIdentifier & string, Value, Params> & {
          _resourceById: ResourceByIdRef<
            GroupIdentifier & string,
            Value,
            Params
          >;
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
        },
  ]
>;

export function craftAsyncMethods<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  AsyncMethods extends {},
>(
  asyncMethodsFactory: (context: CraftFactoryEntries<Context>) => AsyncMethods,
): CraftAsyncMethodsOutputs<Context, StoreConfig, AsyncMethods> {
  return (_cloudProxy) => (contextData) => {
    const asyncMethods = asyncMethodsFactory(
      craftFactoryEntries(contextData),
    ) as Record<
      string,
      AsyncMethodRef<
        unknown,
        unknown,
        unknown,
        unknown,
        unknown,
        unknown,
        unknown
      >
    >;

    const { methods, resourceRefs } = Object.entries(asyncMethods ?? {}).reduce(
      (acc, [methodName, asyncMethodRef]) => {
        const methodValue =
          'method' in asyncMethodRef ? asyncMethodRef.method : undefined;
        if (!methodValue) {
          acc.resourceRefs[methodName] = asyncMethodRef;
          return acc;
        }
        acc.resourceRefs[methodName] = {
          ...asyncMethodRef,
        };
        acc.methods[`set${capitalize(methodName)}`] = methodValue as Function;
        return acc;
      },
      {
        methods: {},
        resourceRefs: {},
      } as {
        resourceRefs: Record<
          string,
          Omit<
            AsyncMethodRef<
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
      },
    );

    return partialContext({
      props: resourceRefs,
      methods,
      _asyncMethods: resourceRefs,
    }) as unknown as SpecificCraftAsyncMethodsOutputs<AsyncMethods>;
  };
}
