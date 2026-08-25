import {
  asyncProcess as craftAsyncProcess,
  craftComputed,
  mutation as craftMutation,
  query as craftQuery,
  type AsyncProcessOutput,
  type InsertionParams,
  type MutationOutput,
  type NamedCraftPrimitiveGen,
  type QueryOutput,
  type YieldableReactiveValue,
} from '@craft-ts/core';
import { Effect } from 'effect';
import { runEffect } from './run-effect';
import { syncEffect, type AssertDeclaredSync } from './sync-op';
import type { EffectExceptionOf } from './effect-exceptions';

/** The context passed to an Effect-aware Craft resource loader. */
export type EffectLoaderParams<Params> = {
  readonly params: Params;
  readonly abortSignal: AbortSignal;
  readonly previous: {
    readonly status: unknown;
    readonly value?: unknown;
  };
};

export type EffectLoader<Params, Value, Error = never, Requirements = never> = (
  context: EffectLoaderParams<Params>,
) => Effect.Effect<Value, Error, Requirements>;

type SynchronousValue<Value> = Value extends Effect.Effect<any, any, any>
  ? never
  : Value;
type SynchronousResult<Value> =
  | SynchronousValue<Value>
  | Generator<unknown, SynchronousValue<Value>, unknown>;

type EffectExceptions<Error> = {
  params: never;
  loader: EffectExceptionOf<Error>;
};

type EffectComputedFactory<Value, Error, Requirements> =
  | (() => Effect.Effect<Value, Error, Requirements>)
  | (() =>
      | Generator<unknown, Effect.Effect<Value, Error, Requirements>, unknown>
      | Effect.Effect<Value, Error, Requirements>);

type EffectInsertionResult<Insertion> = Insertion extends (
  ...args: never[]
) => infer Result
  ? Result extends Generator<unknown, infer Output, unknown>
    ? Output
    : Result
  : Record<never, never>;

type EffectInsertionContext<
  Name extends string,
  Params,
  Value extends object | undefined,
  Error,
> = InsertionParams<
  Value,
  Params,
  { params: unknown; loader: EffectExceptionOf<Error> },
  Record<never, never>,
  Name
>;

type EffectQueryConfig<Params, Value, Error, Requirements> = {
  readonly params: () => SynchronousResult<Params>;
  readonly loader: EffectLoader<Params, Value, Error, Requirements>;
  readonly [key: string]: unknown;
};

type EffectQueryMethodConfig<
  Args,
  Params,
  Value,
  Error,
  Requirements,
> = {
  /** Methods may read Craft dependencies, but never return an Effect. */
  readonly method: (args: Args) => SynchronousResult<Params>;
  readonly loader: EffectLoader<Params, Value, Error, Requirements>;
  readonly [key: string]: unknown;
};

type EffectMutationConfig<
  Args,
  Params,
  Value,
  Error,
  Requirements,
> = {
  /** Methods may read Craft dependencies, but never return an Effect. */
  readonly method: (args: Args) => SynchronousResult<Params>;
  readonly loader: EffectLoader<Params, Value, Error, Requirements>;
  readonly [key: string]: unknown;
};

type EffectParamsConfig<Params, Value, Error, Requirements> = {
  readonly params: () => SynchronousResult<Params>;
  readonly loader: EffectLoader<Params, Value, Error, Requirements>;
  readonly [key: string]: unknown;
};

type EffectAsyncProcessConfig<
  Args,
  Params,
  Value,
  Error,
  Requirements,
> = {
  /** Methods may read Craft dependencies, but never return an Effect. */
  readonly method: (args: Args) => SynchronousResult<Params>;
  readonly loader: EffectLoader<Params, Value, Error, Requirements>;
  readonly [key: string]: unknown;
};

/**
 * Creates a reactive Effect computation.
 *
 * The factory may read Craft dependencies synchronously through a generator
 * and returns the Effect that should be run whenever those dependencies
 * change. The returned ref deliberately has the same resource lifecycle as a
 * query: loading, cancellation, typed Effect exceptions, and the active
 * `provideLayer(...)` are all handled by the existing query runtime.
 */
/**
 * Derives a reactive value from an Effect — the Effect counterpart of
 * `craftComputed`, and that symmetry is the contract:
 *
 *     craftComputed : computedEffect  ::  query : queryEffect
 *
 * The factory reads Craft dependencies with `yield*` and RETURNS an Effect; it
 * never runs it. The adapter runs it in place, so the result is a plain
 * reactive value — no loading state, no `settled(...)`, no `pendingNode`.
 *
 * Which is why the Effect must be declared synchronous: a computation is asked
 * for its value now, and cannot suspend to produce it. An Effect whose `R` does
 * not carry `SyncOp` is refused at the call site. That is not a gap — the
 * suspending case is what `queryEffect` exists for, and routing it here would
 * mean silently handing back a resource where the caller asked for a value.
 *
 * A typed failure is fine: failing is not suspending. It travels on craft's
 * exception channel exactly as `syncEffect`'s does.
 *
 * @example
 * const totalLabel = computedEffect('totalLabel', function* () {
 *   return cartTotalLabel(yield* lines());
 * });
 *
 * // p({ class: 'result' }, totalLabel) — read like any craftComputed
 */
export function computedEffect<Value, Error, Requirements>(
  factory: EffectComputedFactory<Value, Error, Requirements> &
    AssertDeclaredSync<Requirements>,
): YieldableReactiveValue<Value, 'computed'>;
export function computedEffect<Name extends string, Value, Error, Requirements>(
  name: Name,
  factory: EffectComputedFactory<Value, Error, Requirements> &
    AssertDeclaredSync<Requirements>,
): YieldableReactiveValue<Value, Name>;
export function computedEffect(
  nameOrFactory: string | EffectComputedFactory<unknown, unknown, unknown>,
  maybeFactory?: EffectComputedFactory<unknown, unknown, unknown>,
): unknown {
  const hasName = typeof nameOrFactory === 'string';
  const name = hasName ? nameOrFactory : 'computed';
  const factory = (hasName ? maybeFactory : nameOrFactory) as EffectComputedFactory<
    unknown,
    unknown,
    unknown
  >;

  return craftComputed(name, function* () {
    const produced = (
      factory as () =>
        | Effect.Effect<unknown, unknown, unknown>
        | Generator<unknown, Effect.Effect<unknown, unknown, unknown>, unknown>
    )();

    const effect = Effect.isEffect(produced) ? produced : yield* produced;

    if (!Effect.isEffect(effect)) {
      throw new TypeError(
        `computedEffect('${name}') factory must return an Effect.`,
      );
    }

    return yield* syncEffect(effect as never, {
      label: `computedEffect('${name}')`,
    });
  });
}

/**
 * Converts an Effect callback into the generator callback expected by Craft.
 *
 * Requirements are deliberately accepted here: the runtime bridge resolves
 * them from the nearest `provideLayer(...)`. `runEffect` keeps its stricter
 * direct-call contract for advanced users who want a compile-time
 * `assertNoRequirements` check at an individual yield site.
 */
export function effectLoader<
  Args extends readonly unknown[],
  Value,
  Error,
  Requirements,
>(
  callback: (...args: Args) => Effect.Effect<Value, Error, Requirements>,
): (...args: Args) => Generator<unknown, Value, unknown> {
  return ((...args: Args) =>
    (function* () {
      return yield* runEffect(
        callback(...args) as Effect.Effect<Value, Error, never>,
      );
    })()) as (...args: Args) => Generator<unknown, Value, unknown>;
}

function adaptConfig<
  Config extends {
    readonly method?: unknown;
    readonly loader: (
      ...args: never[]
    ) => Effect.Effect<unknown, unknown, unknown>;
  },
>(
  config: Config,
): Omit<Config, 'loader'> & {
  readonly loader: (...args: never[]) => Generator<unknown, unknown, unknown>;
} {
  return {
    ...config,
    loader: function* (context: EffectLoaderParams<unknown>) {
      return yield* runEffect(
        config.loader(context as never) as Effect.Effect<
          unknown,
          unknown,
          never
        >,
      );
    },
  } as Omit<Config, 'loader'> & {
    readonly loader: (...args: never[]) => Generator<unknown, unknown, unknown>;
  };
}

type GroupIdentifier<Config> = Config extends {
  readonly identifier: (...args: never[]) => infer Identifier;
}
  ? Identifier
  : unknown;

export function queryEffect<
  Name extends string,
  Params,
  Value extends object | undefined,
  Error,
  Requirements,
>(
  name: Name,
  config: EffectQueryConfig<Params, Value, Error, Requirements>,
): NamedCraftPrimitiveGen<
  Name,
  QueryOutput<
    Value,
    Params,
    unknown,
    Params,
    unknown,
    Record<never, never>,
    EffectExceptions<Error>,
    Record<never, never>,
    false,
    never,
    Name
  >
>;
export function queryEffect<
  Name extends string,
  Params,
  Value extends object | undefined,
  Error,
  Requirements,
  Insertion extends (
    context: EffectInsertionContext<
      Name,
      Params,
      Value,
      Error
    >
  ) => any,
>(
  name: Name,
  config: EffectQueryConfig<Params, Value, Error, Requirements>,
  insertion: Insertion,
): NamedCraftPrimitiveGen<
  Name,
  QueryOutput<
    Value,
    Params,
    unknown,
    Params,
    unknown,
    EffectInsertionResult<Insertion>,
    EffectExceptions<Error>,
    Record<never, never>,
    false,
    never,
    Name
  >
>;
export function queryEffect<
  Name extends string,
  Args,
  Params,
  Value extends object | undefined,
  Error,
  Requirements,
>(
  name: Name,
  config: EffectQueryMethodConfig<
    Args,
    Params,
    Value,
    Error,
    Requirements
  >,
): NamedCraftPrimitiveGen<
  Name,
  QueryOutput<
    Value,
    Params,
    Args,
    Params,
    GroupIdentifier<typeof config>,
    Record<never, never>,
    EffectExceptions<Error>,
    Record<never, never>,
    false,
    never,
    Name
  >
>;
export function queryEffect<
  Name extends string,
  Args,
  Params,
  Value extends object | undefined,
  Error,
  Requirements,
  Insertion extends (
    context: EffectInsertionContext<Name, Params, Value, Error>
  ) => any,
>(
  name: Name,
  config: EffectQueryMethodConfig<
    Args,
    Params,
    Value,
    Error,
    Requirements
  >,
  insertion: Insertion,
): NamedCraftPrimitiveGen<
  Name,
  QueryOutput<
    Value,
    Params,
    Args,
    Params,
    GroupIdentifier<typeof config>,
    EffectInsertionResult<Insertion>,
    EffectExceptions<Error>,
    Record<never, never>,
    false,
    never,
    Name
  >
>;
export function queryEffect(
  name: string,
  config: {
    readonly params?: unknown;
    readonly method?: unknown;
    readonly loader: (
      ...args: never[]
    ) => Effect.Effect<unknown, unknown, unknown>;
  },
  ...insertions: readonly unknown[]
): unknown {
  return (
    craftQuery as unknown as (
      name: string,
      config: unknown,
      ...insertions: readonly unknown[]
    ) => unknown
  )(name, adaptConfig(config), ...insertions);
}

export function mutationEffect<
  Name extends string,
  Args,
  Params,
  Value,
  Error,
  Requirements,
>(
  name: Name,
  config: EffectMutationConfig<
    Args,
    Params,
    Value,
    Error,
    Requirements
  >,
): NamedCraftPrimitiveGen<
  Name,
  MutationOutput<
    Value,
    Params,
    Args,
    Params,
    GroupIdentifier<typeof config>,
    Record<never, never>,
    EffectExceptions<Error>,
    Record<never, never>,
    false,
    never,
    true,
    Name
  >
>;
export function mutationEffect<
  Name extends string,
  Params,
  Value,
  Error,
  Requirements,
>(
  name: Name,
  config: EffectParamsConfig<Params, Value, Error, Requirements>,
): NamedCraftPrimitiveGen<
  Name,
  MutationOutput<
    Value,
    Params,
    unknown,
    Params,
    GroupIdentifier<typeof config>,
    Record<never, never>,
    EffectExceptions<Error>,
    Record<never, never>,
    false,
    never,
    false,
    Name
  >
>;
export function mutationEffect(
  name: string,
  config: {
    readonly loader: (
      ...args: never[]
    ) => Effect.Effect<unknown, unknown, unknown>;
  },
  ...insertions: readonly unknown[]
): unknown {
  return (
    craftMutation as unknown as (
      name: string,
      config: unknown,
      ...insertions: readonly unknown[]
    ) => unknown
  )(name, adaptConfig(config), ...insertions);
}

export function asyncProcessEffect<
  Name extends string,
  Args,
  Params,
  Value extends object | undefined,
  Error,
  Requirements,
>(
  name: Name,
  config: EffectAsyncProcessConfig<
    Args,
    Params,
    Value,
    Error,
    Requirements
  >,
): NamedCraftPrimitiveGen<
  Name,
  AsyncProcessOutput<
    Value,
    Params,
    Args,
    Params,
    GroupIdentifier<typeof config>,
    Record<never, never>,
    EffectExceptions<Error>,
    Record<never, never>,
    false,
    never,
    Name
  >
>;
export function asyncProcessEffect<
  Name extends string,
  Params,
  Value extends object | undefined,
  Error,
  Requirements,
>(
  name: Name,
  config: EffectParamsConfig<Params, Value, Error, Requirements>,
): NamedCraftPrimitiveGen<
  Name,
  AsyncProcessOutput<
    Value,
    Params,
    unknown,
    Params,
    GroupIdentifier<typeof config>,
    Record<never, never>,
    EffectExceptions<Error>,
    Record<never, never>,
    false,
    never,
    Name
  >
>;
export function asyncProcessEffect(
  name: string,
  config: {
    readonly loader: (
      ...args: never[]
    ) => Effect.Effect<unknown, unknown, unknown>;
  },
  ...insertions: readonly unknown[]
): unknown {
  return (
    craftAsyncProcess as unknown as (
      name: string,
      config: unknown,
      ...insertions: readonly unknown[]
    ) => unknown
  )(name, adaptConfig(config), ...insertions);
}
