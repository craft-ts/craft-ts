import { Signal } from '@angular/core';
import {
  ContextConstraints,
  craftFactoryEntries,
  CraftFactoryEntries,
  CraftFactoryUtility,
  partialContext,
  PartialContext,
  StoreConfigConstraints,
} from './craft';

type SpecificCraftComputedOutputs<Computed extends {}> = PartialContext<{
  props: Computed;
}>;

type CraftComputedStatesOutputs<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  Computed extends {}
> = CraftFactoryUtility<
  Context,
  StoreConfig,
  SpecificCraftComputedOutputs<Computed>
>;

export function craftComputedStates<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  Computed extends {}
>(
  computedFactory: (context: CraftFactoryEntries<Context>) => Computed
): CraftComputedStatesOutputs<Context, StoreConfig, Computed> {
  return () => (contextData) => {
    const computedValues = computedFactory(
      craftFactoryEntries(contextData)
    ) as Record<string, Signal<unknown>>;

    return partialContext({
      props: computedValues,
    }) as SpecificCraftComputedOutputs<Computed>;
  };
}
