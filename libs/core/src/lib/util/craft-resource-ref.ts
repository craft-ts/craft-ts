import { ResourceRef, Signal } from '@angular/core';

export type CraftResourceRefSpecificState<Value, Params> = {
  paramSrc: Signal<Params | undefined>;
  /**
   * Return undefined if the value is not set (error or not retrieved)
   */
  safeValue: Signal<Value | undefined>;
  state: Signal<Value | undefined>;
};
/**
 * Angular's `error` signal is excluded from the craft surface: business failures
 * are exposed through the `exceptions()`/`hasException()` API instead. The raw
 * signal still exists on the ref at runtime as an internal channel (see
 * `craftUntilSettled`, which rethrows a residual technical failure through it).
 */
export type CraftResourceRef<Value, Params> = Omit<
  ResourceRef<Value>,
  'error'
> &
  CraftResourceRefSpecificState<Value, Params>;
