import { Signal } from '@angular/core';
import {
  ContextConstraints,
  CraftFactoryUtility,
  partialContext,
  PartialContext,
  StoreConfigConstraints,
} from './craft';
import { Prettify } from './util/util.type';

type ToSignalObject<T> = {
  [K in keyof T]: Signal<T[K]>;
};

type SpecificCraftInputsOutputs<Inputs extends {}> = PartialContext<{
  _inputs: Prettify<ToSignalObject<Inputs>>;
}>;

type CraftInputsOutputs<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  Inputs extends {}
> = CraftFactoryUtility<
  Context,
  StoreConfig,
  SpecificCraftInputsOutputs<Inputs>
>;

export function craftInputs<
  Context extends ContextConstraints,
  StoreConfig extends StoreConfigConstraints,
  Inputs extends {}
>(inputs: Inputs): CraftInputsOutputs<Context, StoreConfig, Inputs> {
  // todo expose setXInputs as standalone ?
  return () => () => {
    return partialContext({
      _inputs: inputs,
    }) as SpecificCraftInputsOutputs<Inputs>;
  };
}
