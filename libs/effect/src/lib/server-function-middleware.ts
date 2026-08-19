import type {
  MiddlewareContext,
  PortableServerMiddleware,
  ServerProgramAdapter,
} from '@craft-ts/core';
import { Effect, Layer } from 'effect';

export type EffectMiddlewareNext = <A, E, R>(patch?: {
  readonly context?: MiddlewareContext;
}) => Effect.Effect<A, E, R>;

export type EffectServerMiddlewareContext = {
  readonly input: unknown;
  readonly context: MiddlewareContext;
  readonly clientContext: MiddlewareContext;
  readonly next: EffectMiddlewareNext;
};

export type EffectServerMiddleware<Id extends string = string> =
  PortableServerMiddleware<
    Effect.Effect<unknown, unknown, unknown>,
    Id,
    readonly [],
    Record<never, never>,
    unknown,
    unknown,
    readonly []
  > &
    (<A, E, R>(next: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>);

/**
 * Creates one Effect middleware that is usable in both places:
 *
 * - as a normal Effect combinator: `program.pipe(withAudit)`;
 * - as a portable Craft middleware: `portableServerFunction(...).use(withAudit)`.
 *
 * The core only sees the second shape. The callable facade stays in this
 * package, where Effect's A/E/R channels are available.
 */
export function effectServerMiddleware<const Id extends string, A, E, R>(
  id: Id,
  run: (context: EffectServerMiddlewareContext) => Effect.Effect<A, E, R>,
): EffectServerMiddleware<Id> {
  const middleware = (<NA, NE, NR>(next: Effect.Effect<NA, NE, NR>) =>
    run({
      input: undefined,
      context: {},
      clientContext: {},
      next: (<XA, XE, XR>() =>
        next as unknown as Effect.Effect<XA, XE, XR>) as EffectMiddlewareNext,
    }) as unknown as Effect.Effect<NA, NE, NR>) as EffectServerMiddleware<Id>;

  Object.assign(middleware, {
    kind: 'server-function-middleware' as const,
    id,
    inputs: [],
    clientContexts: [],
    dependencies: [],
    run(context: {
      readonly input: unknown;
      readonly context: MiddlewareContext;
      readonly clientContext: MiddlewareContext;
      readonly resolve: <Value>(token: unknown) => Value;
      readonly next: (patch: {
        readonly context: MiddlewareContext;
      }) => Effect.Effect<unknown, unknown, unknown>;
    }) {
      return run({
        input: context.input,
        context: context.context,
        clientContext: context.clientContext,
        next: <NA, NE, NR>(
          patch: { readonly context?: MiddlewareContext } = {},
        ) =>
          context.next({
            context: patch?.context ?? {},
          }) as unknown as Effect.Effect<NA, NE, NR>,
      });
    },
  });

  return middleware;
}

/** Compose a list in onion order, with the first item as the outer layer. */
export function composeEffect<A, E, R>(
  middlewares: readonly EffectServerMiddleware[],
  handler: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return middlewares.reduceRight(
    (program, middleware) => middleware(program),
    handler,
  );
}

/** Execute an Effect program returned by a portable server function. */
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
