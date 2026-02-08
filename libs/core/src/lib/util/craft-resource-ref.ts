import { ResourceRef, Signal } from '@angular/core';
import { AsyncStateManager } from './persister.type';

export type CraftResourceRefSpecificState<Value, Params> = {
  paramSrc: Signal<Params | undefined>;
  /**
   * Return undefined if the value is not set (error or not retrieved)
   */
  safeValue: Signal<Value | undefined>;
  state: Signal<Value | undefined>;
  asyncStateManager: AsyncStateManager<unknown, Value, Params>;
};
export type CraftResourceRef<Value, Params> = ResourceRef<Value> &
  CraftResourceRefSpecificState<Value, Params>;
