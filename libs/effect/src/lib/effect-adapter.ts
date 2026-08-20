import {
  asyncProcess as craftAsyncProcess,
  craftComputed,
  mutation as craftMutation,
  query as craftQuery,
  type AsyncProcessOutput,
  type MutationOutput,
  type NamedCraftPrimitiveGen,
  type QueryOutput,
} from '@craft-ts/core';
import { Effect } from 'effect';
import { runEffect } from './run-effect';
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

type EffectQueryConfig<Params, Value, Error, Requirements> = {
  readonly params: () => Params;
  readonly loader: EffectLoader<Params, Value, Error, Requirements>;
  readonly [key: string]: unknown;
};

type EffectQueryMethodConfig<
  Args,
  Params,
  Value,
  Error,
  Requirements,
  MethodError,
  MethodRequirements,
> = {
  readonly method: (
    args: Args,
  ) =>
    | Params
    | Effect.Effect<Params, MethodError, MethodRequirements>
    | Generator<
        unknown,
        Params | Effect.Effect<Params, MethodError, MethodRequirements>,
        unknown
      >;
  readonly loader: EffectLoader<Params, Value, Error, Requirements>;
  readonly [key: string]: unknown;
};

type EffectMutationConfig<
  Args,
  Params,
  Value,
  Error,
  Requirements,
  MethodError,
  MethodRequirements,
> = {
  readonly method: (
    args: Args,
  ) =>
    | Params
    | Effect.Effect<Params, MethodError, MethodRequirements>
    | Generator<
        unknown,
        Params | Effect.Effect<Params, MethodError, MethodRequirements>,
        unknown
      >;
  readonly loader: EffectLoader<Params, Value, Error, Requirements>;
  readonly [key: string]: unknown;
};

type EffectParamsConfig<Params, Value, Error, Requirements> = {
  readonly params: () => Params;
  readonly loader: EffectLoader<Params, Value, Error, Requirements>;
  readonly [key: string]: unknown;
};

type EffectAsyncProcessConfig<
  Args,
  Params,
  Value,
  Error,
  Requirements,
  MethodError,
  MethodRequirements,
> = {
  readonly method: (
    args: Args,
  ) =>
    | Params
    | Effect.Effect<Params, MethodError, MethodRequirements>
    | Generator<
        unknown,
        Params | Effect.Effect<Params, MethodError, MethodRequirements>,
        unknown
      >;
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
export function computedEffect<Name extends string, Value, Error, Requirements>(
  name: Name,
  factory: EffectComputedFactory<Value, Error, Requirements>,
): NamedCraftPrimitiveGen<
  Name,
  QueryOutput<
    Value,
    Effect.Effect<Value, Error, Requirements>,
    unknown,
    Effect.Effect<Value, Error, Requirements>,
    unknown,
    Record<never, never>,
    EffectExceptions<Error>,
    Record<never, never>,
    false,
    never,
    Name
  >
>;
export function computedEffect<
  Name extends string,
  Value,
  Error,
  Requirements,
  Insertion extends (...args: any[]) => any,
>(
  name: Name,
  factory: EffectComputedFactory<Value, Error, Requirements>,
  insertion: Insertion,
): NamedCraftPrimitiveGen<
  Name,
  QueryOutput<
    Value,
    Effect.Effect<Value, Error, Requirements>,
    unknown,
    Effect.Effect<Value, Error, Requirements>,
    unknown,
    EffectInsertionResult<Insertion>,
    EffectExceptions<Error>,
    Record<never, never>,
    false,
    never,
    Name
  >
>;
export function computedEffect(
  name: string,
  factory: EffectComputedFactory<unknown, unknown, unknown>,
  ...insertions: readonly unknown[]
): unknown {
  const effectSource = craftComputed(
    `${name}EffectFactory`,
    factory as (...args: never[]) => unknown,
  );

  return (
    craftQuery as unknown as (
      name: string,
      config: unknown,
      ...insertions: readonly unknown[]
    ) => unknown
  )(
    name,
    {
      params: () => effectSource(),
      loader: function* ({ params }: { params: unknown }) {
        if (!Effect.isEffect(params)) {
          throw new TypeError(
            `computedEffect('${name}') factory must return an Effect.`,
          );
        }

        return yield* runEffect(
          params as Effect.Effect<unknown, unknown, never>,
        );
      },
    },
    ...insertions,
  );
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
  const resolveMethodEffect = typeof config['method'] === 'function';

  return {
    ...config,
    loader: function* (context: EffectLoaderParams<unknown>) {
      const params =
        resolveMethodEffect && Effect.isEffect(context.params)
          ? yield* runEffect(
              context.params as Effect.Effect<unknown, unknown, never>,
            )
          : context.params;

      return yield* runEffect(
        config.loader({ ...context, params } as never) as Effect.Effect<
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
  Insertion extends (...args: any[]) => any,
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
  MethodError = never,
  MethodRequirements = never,
>(
  name: Name,
  config: EffectQueryMethodConfig<
    Args,
    Params,
    Value,
    Error,
    Requirements,
    MethodError,
    MethodRequirements
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
    EffectExceptions<Error | MethodError>,
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
  Insertion extends (...args: any[]) => any,
  MethodError = never,
  MethodRequirements = never,
>(
  name: Name,
  config: EffectQueryMethodConfig<
    Args,
    Params,
    Value,
    Error,
    Requirements,
    MethodError,
    MethodRequirements
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
    EffectExceptions<Error | MethodError>,
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
  MethodError = never,
  MethodRequirements = never,
>(
  name: Name,
  config: EffectMutationConfig<
    Args,
    Params,
    Value,
    Error,
    Requirements,
    MethodError,
    MethodRequirements
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
    EffectExceptions<Error | MethodError>,
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
  MethodError = never,
  MethodRequirements = never,
>(
  name: Name,
  config: EffectAsyncProcessConfig<
    Args,
    Params,
    Value,
    Error,
    Requirements,
    MethodError,
    MethodRequirements
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
    EffectExceptions<Error | MethodError>,
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
