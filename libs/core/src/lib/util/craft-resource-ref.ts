import { ResourceRef, Signal } from '@angular/core';

export type CraftResourceRefSpecificState<Value, Params> = {
  paramSrc: Signal<Params | undefined>;
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
  'error' | 'value'
> &
  {
    /**
     * Returns undefined when the resource has no resolved value or an exception.
     */
    value: Signal<Value | undefined>;
  } &
  CraftResourceRefSpecificState<Value, Params>;
