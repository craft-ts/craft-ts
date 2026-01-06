import { InjectionToken, Type } from '@angular/core';
import {
  ContextConstraints,
  craftFactoryEntries,
  CraftFactoryEntries,
  CraftFactoryUtility,
  partialContext,
  PartialContext,
  StoreConfigConstraints,
} from './craft';

type ProviderTokenWithoutAbstract<T> = Type<T> | InjectionToken<T>;

type InferProvidedType<T> = T extends ProviderTokenWithoutAbstract<infer U>
  ? U
  : never;

type SpecificCraftInjectionsOutputs<Injections extends {}> = PartialContext<{
  _injections: {
    [key in keyof Injections as Uncapitalize<key & string>]: InferProvidedType<
      Injections[key]
    >;
  };
}>;

type CraftInputsOutputs<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  Injections extends {}
> = CraftFactoryUtility<
  Context,
  StoreConfig,
  SpecificCraftInjectionsOutputs<Injections>
>;

// todo checker si ok avec les token si valeur bien infer / service / token et générics

export function craftInject<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  Injections extends {}
>(
  injections: (entries: CraftFactoryEntries<Context>) => Injections
): CraftInputsOutputs<Context, StoreConfig, Injections> {
  return () => (contextData, injector) => {
    const injectedInjections = Object.entries(
      injections(craftFactoryEntries(contextData))
    ).reduce(
      (acc, [key, injection]) => ({
        ...acc,
        [uncapitalize(key)]: injector.get(injection as any),
      }),
      {}
    );
    return partialContext({
      _injections: injectedInjections,
    }) as SpecificCraftInjectionsOutputs<Injections>;
  };
}

function uncapitalize(str: string) {
  return str.charAt(0).toLowerCase() + str.slice(1);
}
