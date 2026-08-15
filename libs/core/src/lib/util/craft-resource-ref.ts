import type { ResourceSnapshot, ResourceStatus, Signal } from '@angular/core';
import type { CraftSettledSignal } from '../craft-settled';

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
export type CraftResourceRef<
  Value,
  Params,
  Source extends string = string,
  Exceptions = never,
> = {
  /**
   * Returns undefined when the resource has no resolved value or an exception.
   */
  value: Signal<Value | undefined>;
  status: Signal<ResourceStatus>;
  isLoading: Signal<boolean>;
  snapshot: Signal<ResourceSnapshot<Value | undefined>>;
  hasValue(): boolean;
  reload(): boolean;
  destroy(): void;
  set(value: Value | undefined): void;
  update(update: (value: Value | undefined) => Value | undefined): void;
  asReadonly(): Omit<
    CraftResourceRef<Value, Params, Source, Exceptions>,
    'set' | 'update' | 'destroy'
  >;
  readonly settledValue: CraftSettledSignal<
    Exclude<Value, undefined>,
    Source,
    Exceptions
  >;
} & CraftResourceRefSpecificState<Value, Params>;
