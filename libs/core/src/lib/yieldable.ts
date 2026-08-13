import {
  isSignal,
  runInInjectionContext,
  type Injector,
  type Signal,
} from '@angular/core';
import {
  executeGeneratorCompatibleFactory,
  isGenerator,
  runCraftGenerator,
  type ResolveGeneratorResult,
} from './craft-generator-runtime';
import {
  YIELDABLE_VALUE,
  type NamedYieldableValue,
  type YieldableReactiveProperties,
  type YieldableReactiveValue,
} from './reactive-read';

export { YIELDABLE_VALUE, type NamedYieldableValue } from './reactive-read';

/** Shared brand used by Craft methods that are safe to delegate with `yield*`. */
export const YIELDABLE_METHOD = Symbol('craft-yieldable-method');

/** Brand used by insertion-owned synchronous selectors/read helpers. */
export const NON_YIELDABLE_INSERTION_METHOD = Symbol(
  'craft-non-yieldable-insertion-method',
);

/** A signal whose template projection can be consumed with `yield*`. */
export type YieldableSignal<Name extends string, Value> = NamedYieldableValue<
  Name,
  Signal<Value>
>;

/** Projects every exposed reactive property to the public reader contract. */
export type BrandReactiveProperties<Shape> = YieldableReactiveProperties<Shape>;

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
 * A method exposed by an insertion. Calling it returns an invocation which can
 * be delegated with `yield*`.
 */
export type YieldableInsertionMethod<
  Args extends unknown[] = unknown[],
  Result = unknown,
  Yielded = unknown,
> = ((...args: Args) => YieldableInvocation<Yielded, Result>) & {
  readonly [YIELDABLE_METHOD]?: {
    readonly args?: Args;
    readonly result?: Result;
    readonly yielded?: Yielded;
  };
};

export type NonYieldableInsertionMethod<
  Args extends unknown[] = unknown[],
  Result = unknown,
> = ((...args: Args) => Result) & {
  readonly [NON_YIELDABLE_INSERTION_METHOD]: true;
};

type YieldableInsertionMethodOf<Fn> =
  Fn extends NonYieldableInsertionMethod<any, any>
    ? Fn
    : Fn extends YieldableReactiveValue<any, any>
      ? Fn
      : Fn extends Signal<any>
        ? Fn
        : Fn extends YieldableInsertionMethod<any, any, any>
          ? Fn
          : Fn extends (...args: infer Args) => infer Result
            ? Result extends Generator<infer Yielded, infer Output, unknown>
              ? YieldableInsertionMethod<Args, Output, Yielded>
              : YieldableInsertionMethod<Args, Result>
            : Fn;

/** Maps callable insertion outputs to methods consumed with `yield*`. */
export type YieldableInsertionMethods<Shape> = Shape extends (
  ...args: infer Args
) => infer Result
  ? ((...args: Args) => Result) & {
      [Key in keyof Shape]: YieldableInsertionMethodOf<Shape[Key]>;
    }
  : {
      [Key in keyof Shape]: YieldableInsertionMethodOf<Shape[Key]>;
    };

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

export type YieldableInsertionRuntimeOptions = Readonly<{
  injector: Injector;
  invalidYieldErrorMessage: string;
  multipleAppStartErrorMessage: string;
  onAppStartNotSupportedErrorMessage: string;
}>;

/**
 * Wraps an insertion method while preserving the existing eager Craft method
 * execution semantics. The resolved result is exposed as a generator so the
 * caller must explicitly consume the action with `yield*`.
 */
export function createYieldableInsertionMethod<
  Fn extends (...args: any[]) => any,
>(
  fn: Fn,
  options: YieldableInsertionRuntimeOptions,
): YieldableInsertionMethodOf<Fn> {
  const method = (...args: Parameters<Fn>) => {
    const result = runInInjectionContext(options.injector, () => {
      const value = fn(...args);
      if (!isGenerator(value)) {
        return value;
      }

      return runCraftGenerator({
        iterator: value,
        injector: options.injector,
        hostScope: 'function',
        invalidYieldErrorMessage: options.invalidYieldErrorMessage,
        multipleAppStartErrorMessage: options.multipleAppStartErrorMessage,
        onAppStartNotSupportedErrorMessage:
          options.onAppStartNotSupportedErrorMessage,
      }).value;
    });

    return yieldableInvocation(result);
  };

  return markYieldableMethod(
    method,
  ) as unknown as YieldableInsertionMethodOf<Fn>;
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

export function markNonYieldableInsertionMethod<
  Fn extends (...args: any[]) => any,
>(fn: Fn): Fn & { readonly [NON_YIELDABLE_INSERTION_METHOD]: true } {
  Object.defineProperty(fn, NON_YIELDABLE_INSERTION_METHOD, { value: true });
  return fn as Fn & { readonly [NON_YIELDABLE_INSERTION_METHOD]: true };
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

export function isNonYieldableInsertionMethod(value: unknown): boolean {
  return typeof value === 'function' && NON_YIELDABLE_INSERTION_METHOD in value;
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
