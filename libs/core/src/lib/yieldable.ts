import type { Injector } from '@angular/core';
import {
  executeGeneratorCompatibleFactory,
  isGenerator,
  type ResolveGeneratorResult,
} from './craft-generator-runtime';

/** Shared brand used by Craft methods that are safe to delegate with `yield*`. */
export const YIELDABLE_METHOD = Symbol('craft-yieldable-method');

export type Yieldable<
  Args extends unknown[] = unknown[],
  Result = unknown,
  Yielded = unknown,
> = (...args: Args) => Generator<Yielded, Result, unknown>;

/**
 * A normal callable carrying the yieldable contract as a phantom property.
 * The normal call signature is intentionally preserved so existing imperative
 * consumers keep type-checking; templates project this brand to `Yieldable`.
 */
export type YieldableMethod<
  Args extends unknown[] = unknown[],
  Result = unknown,
  Yielded = unknown,
> = ((...args: Args) => Result) & {
  readonly [YIELDABLE_METHOD]: {
    readonly args?: Args;
    readonly result?: Result;
    readonly yielded?: Yielded;
  };
};

export type YieldableMethodOf<Fn> = Fn extends (
  ...args: infer Args
) => infer Result
  ? YieldableMethod<Args, Result>
  : Fn;

export type YieldableMethods<Shape> = {
  [Key in keyof Shape]: Shape[Key] extends (...args: infer Args) => infer Result
    ? YieldableMethod<Args, Result>
    : Shape[Key];
};

export function markYieldableMethod<Fn extends (...args: any[]) => any>(
  fn: Fn,
): Fn & { readonly [YIELDABLE_METHOD]: true } {
  Object.defineProperty(fn, YIELDABLE_METHOD, { value: true });
  return fn as Fn & { readonly [YIELDABLE_METHOD]: true };
}

export function isYieldableMethod(value: unknown): boolean {
  return typeof value === 'function' && YIELDABLE_METHOD in value;
}

/** Wraps a sync callback while relaying an already-yieldable result unchanged. */
export function toYieldable<Args extends unknown[], Result, Yielded = unknown>(
  fn: (...args: Args) => Result | Generator<Yielded, Result, unknown>,
): Yieldable<Args, Result, Yielded> {
  return function* yieldableCallback(...args: Args) {
    const result = fn(...args);
    return isGenerator(result) ? yield* result : (result as Result);
  };
}

/** Drives a yieldable callback with the same generator runtime as Craft hosts. */
export function executeYieldable<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
  args: Args,
  injector: Injector,
): ResolveGeneratorResult<Result> {
  return executeGeneratorCompatibleFactory({
    factory: callback,
    thisArg: undefined,
    getInjector: () => injector,
    args,
    invalidYieldErrorMessage:
      'Craft template callbacks can only yield Craft dependencies or yieldable methods.',
    multipleAppStartErrorMessage:
      'Craft template callbacks cannot declare onAppStart(...) more than once.',
    onAppStartNotSupportedErrorMessage:
      'Craft template callbacks do not support onAppStart(...).',
  });
}
