import { ResourceRef, Signal } from '@angular/core';

export type CraftResourceRef<Value, Params> = ResourceRef<Value> & {
  paramSrc: Signal<Params>;
  /**
   * Return undefined if the value is not set (error or not retrieved)
   */
  safeValue: Signal<Value | undefined>;
};
