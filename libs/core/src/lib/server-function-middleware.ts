import {
  assertMiddlewareId,
  flattenMiddlewareGraph,
  type MergeOptionalSchemaOutputs,
  type MergeSchemaInputs,
  type MergeSchemaOutputs,
  type MiddlewareContext,
  type MiddlewareDownstreamError,
  type MiddlewareResult,
  type OverwriteContext,
} from './middleware-schema-shared';
import type {
  AnyCraftClientMiddleware,
  ClientMiddlewareContextOf,
  ClientMiddlewareProvidesOf,
  ClientMiddlewareRunContext,
  CraftClientMiddleware,
} from './client-function-middleware';
import type { CraftSchema } from './schema-validation';
import type * as Effect from 'effect/Effect';

export {
  assertMiddlewareId,
  type MergeOptionalSchemaOutputs,
  type MergeSchemaInputs,
  type MergeSchemaOutputs,
  type MiddlewareContext,
  type MiddlewareDownstreamError,
  type MiddlewareResult,
  type OverwriteContext,
};

/** Concatène les schémas de tous les middleware d'une chaîne, dépendances comprises. */
export type MiddlewareSchemasOfAll<
  Middlewares extends readonly AnyCraftMiddleware[],
> = Middlewares extends readonly [
  infer Head extends AnyCraftMiddleware,
  ...infer Tail extends readonly AnyCraftMiddleware[],
]
  ? readonly [...MiddlewareSchemasOf<Head>, ...MiddlewareSchemasOfAll<Tail>]
  : readonly [];

export type MiddlewareNext = <Context extends MiddlewareContext>(patch: {
  readonly context: Context;
}) => Effect.Effect<MiddlewareResult<Context>, MiddlewareDownstreamError, never>;

export type MiddlewareRunContext<
  Schemas extends readonly CraftSchema[],
  ContextIn extends MiddlewareContext,
  ClientSchemas extends readonly CraftSchema[] = readonly [],
> = {
  readonly input: MergeSchemaOutputs<Schemas>;
  readonly context: ContextIn;
  /**
   * Ce que le middleware a déclaré attendre du navigateur, via
   * `.clientContext(schema)`, validé par le registre avant l'entrée dans la
   * chaîne. Donnée **non fiable** par nature : c'est précisément ce qu'un
   * middleware d'autorisation est là pour confronter à la vraie session.
   */
  readonly clientContext: MergeOptionalSchemaOutputs<ClientSchemas>;
  readonly next: MiddlewareNext;
};

export interface CraftMiddleware<
  Id extends string = string,
  Schemas extends readonly CraftSchema[] = readonly CraftSchema[],
  ContextOut extends MiddlewareContext = MiddlewareContext,
  Error = never,
  Requirements = never,
  ClientSchemas extends readonly CraftSchema[] = readonly CraftSchema[],
> {
  readonly kind: 'server-function-middleware';
  readonly id: Id;
  readonly inputs: Schemas;
  /** Schémas du contexte client exigés, dépendances comprises. */
  readonly clientContexts: ClientSchemas;
  readonly dependencies: readonly AnyCraftMiddleware[];
  readonly run: (
    context: MiddlewareRunContext<Schemas, MiddlewareContext, ClientSchemas>,
  ) => Effect.Effect<unknown, Error, Requirements>;
  /** Porteur type-only du contexte publié, dépendances transitives comprises. */
  readonly __contextOut?: ContextOut;
}

export type AnyCraftMiddleware = CraftMiddleware<
  string,
  readonly CraftSchema[],
  any,
  any,
  any,
  readonly CraftSchema[]
>;

export type MiddlewareClientContextsOf<Middleware> =
  Middleware extends CraftMiddleware<
    any,
    any,
    any,
    any,
    any,
    infer ClientSchemas
  >
    ? ClientSchemas
    : readonly [];

/** Schémas de contexte client de toute une chaîne, dépendances comprises. */
export type MiddlewareClientContextsOfAll<
  Middlewares extends readonly AnyCraftMiddleware[],
> = Middlewares extends readonly [
  infer Head extends AnyCraftMiddleware,
  ...infer Tail extends readonly AnyCraftMiddleware[],
]
  ? readonly [
      ...MiddlewareClientContextsOf<Head>,
      ...MiddlewareClientContextsOfAll<Tail>,
    ]
  : readonly [];

export type MiddlewareSchemasOf<Middleware> = Middleware extends CraftMiddleware<
  any,
  infer Schemas,
  any,
  any,
  any,
  any
>
  ? Schemas
  : readonly [];

export type MiddlewareContextOf<Middleware> = Middleware extends CraftMiddleware<
  any,
  any,
  infer Context,
  any,
  any,
  any
>
  ? Context
  : never;

export type MiddlewareErrorOf<Middleware> = Middleware extends CraftMiddleware<
  any,
  any,
  any,
  infer Error,
  any,
  any
>
  ? Error
  : never;

export type MiddlewareRequirementsOf<Middleware> =
  Middleware extends CraftMiddleware<
    any,
    any,
    any,
    any,
    infer Requirements,
    any
  >
    ? Requirements
    : never;

/**
 * Fold ordonné des contextes : le dernier middleware gagne. Les dépendances
 * transitives sont déjà aplaties dans le contexte publié par chaque middleware,
 * le fold reste donc à un seul niveau.
 */
export type MergedMiddlewareContext<
  Middlewares extends readonly AnyCraftMiddleware[],
> = Middlewares extends readonly [
  infer Head extends AnyCraftMiddleware,
  ...infer Tail extends readonly AnyCraftMiddleware[],
]
  ? OverwriteContext<MiddlewareContextOf<Head>, MergedMiddlewareContext<Tail>>
  : Record<never, never>;

export type MergedMiddlewareError<
  Middlewares extends readonly AnyCraftMiddleware[],
> = MiddlewareErrorOf<Middlewares[number]>;

export type MergedMiddlewareRequirements<
  Middlewares extends readonly AnyCraftMiddleware[],
> = MiddlewareRequirementsOf<Middlewares[number]>;

export interface CraftMiddlewareBuilder<
  Id extends string,
  Schemas extends readonly CraftSchema[],
  ContextIn extends MiddlewareContext,
  Error,
  Requirements,
  Provides extends readonly CraftSchema[] = readonly [],
  ClientSchemas extends readonly CraftSchema[] = readonly [],
> {
  /**
   * Déclare une dépendance : son contexte, ses schémas et ses canaux sont
   * hérités. Les deux familles sont acceptées, mais pas mélangées : le
   * terminal (`.server` ou `.client`) refuse une dépendance de l'autre famille.
   */
  readonly use: {
    <Middleware extends AnyCraftMiddleware>(
      middleware: Middleware,
    ): CraftMiddlewareBuilder<
      Id,
      readonly [...Schemas, ...MiddlewareSchemasOf<Middleware>],
      OverwriteContext<ContextIn, MiddlewareContextOf<Middleware>>,
      Error | MiddlewareErrorOf<Middleware>,
      Requirements | MiddlewareRequirementsOf<Middleware>,
      Provides,
      readonly [...ClientSchemas, ...MiddlewareClientContextsOf<Middleware>]
    >;
    <Middleware extends AnyCraftClientMiddleware>(
      middleware: Middleware,
    ): CraftMiddlewareBuilder<
      Id,
      Schemas,
      OverwriteContext<ContextIn, ClientMiddlewareContextOf<Middleware>>,
      Error,
      Requirements,
      readonly [...Provides, ...ClientMiddlewareProvidesOf<Middleware>],
      ClientSchemas
    >;
  };
  /** Ajoute un fragment d'input, fusionné dans celui de la server function. */
  readonly input: <Schema extends CraftSchema>(
    schema: Schema,
  ) => CraftMiddlewareBuilder<
    Id,
    readonly [...Schemas, Schema],
    ContextIn,
    Error,
    Requirements,
    Provides,
    ClientSchemas
  >;
  /**
   * Déclare ce que ce middleware **serveur** attend du navigateur.
   *
   * Le schéma remonte dans le contexte client attendu par toute server function
   * qui l'utilise — même mécanique que la fusion des schémas d'input. Le
   * registre le valide en amont de la chaîne, et le middleware le lit sous
   * `clientContext`, séparé de `context` : c'est une déclaration du client, à
   * confronter à la session, jamais à accepter telle quelle.
   */
  readonly clientContext: <Schema extends CraftSchema>(
    schema: Schema,
  ) => CraftMiddlewareBuilder<
    Id,
    Schemas,
    ContextIn,
    Error,
    Requirements,
    Provides,
    readonly [...ClientSchemas, Schema]
  >;
  /**
   * Déclare ce qu'un middleware **client** publie dans le contexte transporté.
   * Ce schéma est le contrat lisible par le serveur : il valide la sortie de la
   * chaîne côté navigateur, et c'est lui que le graphe d'architecture compare
   * au `clientContext` attendu par la server function.
   */
  readonly provides: <Schema extends CraftSchema>(
    schema: Schema,
  ) => CraftMiddlewareBuilder<
    Id,
    Schemas,
    ContextIn,
    Error,
    Requirements,
    readonly [...Provides, Schema],
    ClientSchemas
  >;
  readonly server: <
    ContextOut extends MiddlewareContext,
    RunError,
    RunRequirements,
  >(
    run: (
      context: MiddlewareRunContext<Schemas, ContextIn, ClientSchemas>,
    ) => Effect.Effect<MiddlewareResult<ContextOut>, RunError, RunRequirements>,
  ) => CraftMiddleware<
    Id,
    Schemas,
    OverwriteContext<ContextIn, ContextOut>,
    Error | Exclude<RunError, MiddlewareDownstreamError>,
    Requirements | RunRequirements,
    ClientSchemas
  >;
  /**
   * Terminal client : `run` est un générateur craft nu, drivé par le runtime
   * craft (le même que les guards), et non un Effect.
   */
  readonly client: <ContextOut extends MiddlewareContext>(
    run: (
      context: ClientMiddlewareRunContext<ContextIn>,
    ) => Generator<unknown, MiddlewareResult<ContextOut>, unknown>,
  ) => CraftClientMiddleware<
    Id,
    Provides,
    OverwriteContext<ContextIn, ContextOut>
  >;
}

export function craftMiddleware<const Id extends string>(
  id: Id,
): CraftMiddlewareBuilder<
  Id,
  readonly [],
  Record<never, never>,
  never,
  never,
  readonly [],
  readonly []
> {
  assertMiddlewareId(id);
  return makeBuilder(id, [], [], [], []) as CraftMiddlewareBuilder<
    Id,
    readonly [],
    Record<never, never>,
    never,
    never,
    readonly [],
    readonly []
  >;
}

type AnyMiddlewareValue = AnyCraftMiddleware | AnyCraftClientMiddleware;

function makeBuilder(
  id: string,
  inputs: readonly CraftSchema[],
  dependencies: readonly AnyMiddlewareValue[],
  provides: readonly CraftSchema[],
  clientContexts: readonly CraftSchema[],
): unknown {
  return {
    use(middleware: AnyMiddlewareValue) {
      return makeBuilder(
        id,
        middleware.kind === 'server-function-middleware'
          ? [...inputs, ...middleware.inputs]
          : inputs,
        [...dependencies, middleware],
        middleware.kind === 'client-function-middleware'
          ? [...provides, ...middleware.provides]
          : provides,
        middleware.kind === 'server-function-middleware'
          ? [...clientContexts, ...middleware.clientContexts]
          : clientContexts,
      );
    },
    input(schema: CraftSchema) {
      return makeBuilder(
        id,
        [...inputs, schema],
        dependencies,
        provides,
        clientContexts,
      );
    },
    provides(schema: CraftSchema) {
      return makeBuilder(
        id,
        inputs,
        dependencies,
        [...provides, schema],
        clientContexts,
      );
    },
    clientContext(schema: CraftSchema) {
      return makeBuilder(id, inputs, dependencies, provides, [
        ...clientContexts,
        schema,
      ]);
    },
    server(run: CraftMiddleware['run']) {
      return Object.freeze({
        kind: 'server-function-middleware' as const,
        id,
        inputs,
        clientContexts,
        dependencies: assertSameFamily(
          id,
          dependencies,
          'server-function-middleware',
        ),
        run,
      });
    },
    client(run: CraftClientMiddleware['run']) {
      return Object.freeze({
        kind: 'client-function-middleware' as const,
        id,
        provides,
        dependencies: assertSameFamily(
          id,
          dependencies,
          'client-function-middleware',
        ),
        run,
      });
    },
  };
}

/**
 * Un middleware client et un middleware serveur ne s'exécutent ni au même
 * endroit ni avec le même moteur : les composer serait un contresens, et le
 * runtime ne saurait pas quoi faire de la dépendance étrangère.
 */
function assertSameFamily<Kind extends AnyMiddlewareValue['kind']>(
  id: string,
  dependencies: readonly AnyMiddlewareValue[],
  kind: Kind,
): readonly Extract<AnyMiddlewareValue, { kind: Kind }>[] {
  for (const dependency of dependencies) {
    if (dependency.kind !== kind) {
      throw new Error(
        `Middleware "${id}" is a ${kind === 'client-function-middleware' ? 'client' : 'server'} middleware but depends on "${dependency.id}", which is a ${dependency.kind === 'client-function-middleware' ? 'client' : 'server'} middleware. A chain cannot mix both families.`,
      );
    }
  }
  return dependencies as readonly Extract<AnyMiddlewareValue, { kind: Kind }>[];
}

export function isCraftMiddleware(value: unknown): value is AnyCraftMiddleware {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'server-function-middleware'
  );
}

/** Aplatit les dépendances (profondeur d'abord) et déduplique par identifiant. */
export function flattenMiddlewares(
  middlewares: readonly AnyCraftMiddleware[],
): readonly AnyCraftMiddleware[] {
  return flattenMiddlewareGraph(middlewares);
}

/** Schémas d'input collectés le long de la chaîne, dédupliqués, contrat en tête. */
export function collectMiddlewareSchemas(
  contractInput: CraftSchema,
  middlewares: readonly AnyCraftMiddleware[],
): readonly CraftSchema[] {
  const schemas: CraftSchema[] = [contractInput];
  for (const middleware of flattenMiddlewares(middlewares)) {
    for (const schema of middleware.inputs) {
      if (!schemas.includes(schema)) schemas.push(schema);
    }
  }
  return schemas;
}

/** Même mécanique, appliquée au canal du contexte client. */
export function collectMiddlewareClientContextSchemas(
  contractClientContext: CraftSchema | undefined,
  middlewares: readonly AnyCraftMiddleware[],
): readonly CraftSchema[] {
  const schemas: CraftSchema[] = contractClientContext
    ? [contractClientContext]
    : [];
  for (const middleware of flattenMiddlewares(middlewares)) {
    for (const schema of middleware.clientContexts ?? []) {
      if (!schemas.includes(schema)) schemas.push(schema);
    }
  }
  return schemas;
}

export type MiddlewareChainHandler = (context: {
  readonly input: unknown;
  readonly context: MiddlewareContext;
}) => unknown;

/**
 * Compose la chaîne en oignon. Aucun combinateur Effect n'est utilisé ici : la
 * valeur qui remonte est celle du handler, le brand `MiddlewareResult` est
 * purement type-level. Le core reste donc sans dépendance runtime sur Effect.
 */
export function runMiddlewareChain(
  middlewares: readonly AnyCraftMiddleware[],
  input: unknown,
  handler: MiddlewareChainHandler,
  clientContext: MiddlewareContext = {},
): unknown {
  const chain = flattenMiddlewares(middlewares);

  const step = (index: number, context: MiddlewareContext): unknown => {
    const middleware = chain[index];
    if (!middleware) return handler({ input, context });
    return middleware.run({
      input: input as never,
      context,
      clientContext: clientContext as never,
      next: ((patch: { readonly context: MiddlewareContext }) =>
        step(index + 1, { ...context, ...patch.context })) as never,
    });
  };

  return step(0, {});
}
