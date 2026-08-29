import {
  craftMiddleware,
  runMiddlewareChain,
  type CraftMiddleware,
  type CraftMiddlewareResult,
  type MiddlewareContext,
  type MiddlewareRunContext,
  type PortableServerMiddleware,
  type ServerProgramAdapter,
} from '@craft-ts/core';
import { Effect, Layer } from 'effect';

/**
 * Effect-specific helper. It creates the same yieldable middleware as
 * `craftMiddleware(...).server(...)`; it exists only for applications that
 * want to author the Effect program without repeating the builder call.
 */
export type EffectServerMiddleware<
  Id extends string = string,
  Value = unknown,
  Error = never,
  Requirements = never,
> = CraftMiddleware<
  Id,
  readonly [],
  Value,
  MiddlewareContext,
  Error,
  readonly [],
  Requirements
>;

export type EffectServerMiddlewareContext = MiddlewareRunContext<
  readonly [],
  Record<never, never>
>;

export function effectServerMiddleware<
  const Id extends string,
  Value = unknown,
  Error = never,
  Requirements = never,
>(
  id: Id,
  run: (
    context: EffectServerMiddlewareContext,
  ) => Effect.Effect<
    CraftMiddlewareResult<Value, MiddlewareContext>,
    Error,
    Requirements
  >,
): EffectServerMiddleware<Id, Value, Error, Requirements> {
  return craftMiddleware(id).server((context) => run(context));
}

/**
 * Compose yieldable middleware in declaration order, without continuations.
 *
 * The middleware error and requirement channels are inferred from the array,
 * so a chain of requirement-free middleware keeps the handler's own `R` and
 * stays runnable with `Effect.runPromise`.
 */
export function composeEffect<A, E, R, MiddlewareError, MiddlewareRequirements>(
  middlewares: readonly EffectServerMiddleware<
    string,
    unknown,
    MiddlewareError,
    MiddlewareRequirements
  >[],
  handler: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | MiddlewareError, R | MiddlewareRequirements> {
  return runMiddlewareChain(
    middlewares,
    undefined,
    () => handler,
  ) as Effect.Effect<A, E | MiddlewareError, R | MiddlewareRequirements>;
}

export function executeEffect<Output = unknown>(
  layer?: Layer.Layer<any, any, any>,
): ServerProgramAdapter<unknown, Output> {
  return {
    run: (program: unknown) => {
      if (!Effect.isEffect(program)) return program as Output;
      const effect = program as Effect.Effect<Output, unknown, unknown>;
      return Effect.runPromise(
        layer
          ? (Effect.provide(effect, layer) as Effect.Effect<
              Output,
              unknown,
              never
            >)
          : (effect as Effect.Effect<Output, unknown, never>),
      );
    },
  };
}

export type { PortableServerMiddleware };
