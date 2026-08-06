import { isSignal, type Injector, type Signal } from '@angular/core';
import {
  executeGeneratorCompatibleFactory,
  isGenerator,
  type ResolveGeneratorResult,
} from './craft-generator-runtime';

/** Shared brand used by Craft methods that are safe to delegate with `yield*`. */
export const YIELDABLE_METHOD = Symbol('craft-yieldable-method');

/** Runtime/type brand carried by named reactive values exposed to templates. */
export const YIELDABLE_VALUE = Symbol('craft-yieldable-value');

export type NamedYieldableValue<
  Name extends string = string,
  Value = unknown,
> = Value & {
  readonly [YIELDABLE_VALUE]: Name;
};

/** A signal whose template projection can be consumed with `yield*`. */
export type YieldableSignal<Name extends string, Value> = NamedYieldableValue<
  Name,
  Signal<Value>
>;

type BrandReactiveProperty<Key extends PropertyKey, Value> = Value extends {
  readonly [YIELDABLE_VALUE]: string;
}
  ? Value
  : Value extends Signal<infer State>
    ? Value & YieldableSignal<Key extends string ? Key : string, State>
    : Value;

/** Brands direct signal properties while leaving methods and plain values intact. */
export type BrandReactiveProperties<Shape> = [Shape] extends [object]
  ? {
      [Key in keyof Shape as Shape[Key] extends Signal<any>
        ? Key
        : never]: BrandReactiveProperty<Key, Shape[Key]>;
    } & Shape
  : Shape;

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

/** A primitive trigger invocation consumed with `yield*`. */
export type YieldableInvocation<
  Yielded = unknown,
  Result = unknown,
> = Generator<Yielded, Result, unknown>;

/**
 * Keeps an already-resolved primitive trigger result composable with `yield*`.
 * Primitive methods still resolve their parameters at call time so existing
 * imperative triggers keep their execution timing; the returned invocation is
 * the dependency-tracking boundary consumed by generator hosts.
 */
export function yieldableInvocation<Yielded, Result>(
  result: Result,
): YieldableInvocation<Yielded, Result> {
  return (function* () {
    return result;
  })();
}

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

export function markYieldableValue<Name extends string, Value>(
  value: Value,
  name: Name,
): NamedYieldableValue<Name, Value> {
  if (!isYieldableValue(value)) {
    Object.defineProperty(value as object, YIELDABLE_VALUE, {
      value: name,
      enumerable: false,
    });
  }
  return value as NamedYieldableValue<Name, Value>;
}

export function isYieldableValue(value: unknown): value is NamedYieldableValue {
  return (
    (typeof value === 'function' ||
      (typeof value === 'object' && value !== null)) &&
    YIELDABLE_VALUE in value
  );
}

/** Brands direct reactive members of a runtime value with their property names. */
export function markNamedReactiveProperties<Value>(value: Value): Value {
  if (typeof value !== 'object' && typeof value !== 'function') {
    return value;
  }

  for (const key of Reflect.ownKeys(value as object)) {
    const child = Reflect.get(value as object, key);
    if (typeof child !== 'function') continue;

    if (isSignal(child)) {
      if (!isYieldableValue(child)) {
        markYieldableValue(child, String(key));
      }
    }
  }

  return value;
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
