import type { CraftSchema, SchemaInput, SchemaOutput } from './schema-validation';
import type * as Effect from 'effect/Effect';

export type MiddlewareContext = Record<string, unknown>;

/** Fusion ordonnée de deux contextes : les clés de droite gagnent. */
export type OverwriteContext<Left, Right> = Simplify<
  Omit<Left, keyof Right & keyof Left> & Right
>;

type Simplify<Value> = { [Key in keyof Value]: Value[Key] } & {};

type UnionToIntersection<Union> = (
  Union extends unknown ? (value: Union) => void : never
) extends (value: infer Intersection) => void
  ? Intersection
  : never;

/**
 * Intersection des sorties de tous les schémas collectés le long de la chaîne.
 * Un schéma unique est conservé tel quel : une server function sans middleware
 * peut donc garder un input non objet.
 */
export type MergeSchemaOutputs<Schemas extends readonly CraftSchema[]> =
  Schemas extends readonly [infer Only extends CraftSchema]
    ? SchemaOutput<Only>
    : Simplify<UnionToIntersection<SchemaOutput<Schemas[number]>>>;

/** Pendant de `MergeSchemaOutputs` côté entrée : ce que l'appelant doit fournir. */
export type MergeSchemaInputs<Schemas extends readonly CraftSchema[]> =
  Schemas extends readonly [infer Only extends CraftSchema]
    ? SchemaInput<Only>
    : Simplify<UnionToIntersection<SchemaInput<Schemas[number]>>>;

/** Concatène les schémas de tous les middleware d'une chaîne, dépendances comprises. */
export type MiddlewareSchemasOfAll<
  Middlewares extends readonly AnyCraftMiddleware[],
> = Middlewares extends readonly [
  infer Head extends AnyCraftMiddleware,
  ...infer Tail extends readonly AnyCraftMiddleware[],
]
  ? readonly [...MiddlewareSchemasOf<Head>, ...MiddlewareSchemasOfAll<Tail>]
  : readonly [];

declare const MIDDLEWARE_RESULT: unique symbol;
declare const MIDDLEWARE_DOWNSTREAM_ERROR: unique symbol;

/**
 * Résultat opaque de `next()`, porteur du contexte que le middleware ajoute.
 *
 * C'est le pivot de l'inférence : TypeScript ne peut rien déduire de l'argument
 * passé à un paramètre, mais il déduit sans peine depuis le type de retour. Le
 * contexte voyage donc dans le type retourné par `next()`.
 *
 * Conséquence utile : ce type n'est constructible que par `next()`, donc un
 * middleware ne peut pas réussir sans avoir appelé la suite de la chaîne.
 */
export interface MiddlewareResult<Context extends MiddlewareContext> {
  readonly [MIDDLEWARE_RESULT]: Context;
}

/** Échec produit par la suite de la chaîne : observable, non inspectable. */
export interface MiddlewareDownstreamError {
  readonly [MIDDLEWARE_DOWNSTREAM_ERROR]: true;
}

export type MiddlewareNext = <Context extends MiddlewareContext>(patch: {
  readonly context: Context;
}) => Effect.Effect<MiddlewareResult<Context>, MiddlewareDownstreamError, never>;

export type MiddlewareRunContext<
  Schemas extends readonly CraftSchema[],
  ContextIn extends MiddlewareContext,
> = {
  readonly input: MergeSchemaOutputs<Schemas>;
  readonly context: ContextIn;
  readonly next: MiddlewareNext;
};

export interface CraftMiddleware<
  Id extends string = string,
  Schemas extends readonly CraftSchema[] = readonly CraftSchema[],
  ContextOut extends MiddlewareContext = MiddlewareContext,
  Error = never,
  Requirements = never,
> {
  readonly kind: 'server-function-middleware';
  readonly id: Id;
  readonly inputs: Schemas;
  readonly dependencies: readonly AnyCraftMiddleware[];
  readonly run: (
    context: MiddlewareRunContext<Schemas, MiddlewareContext>,
  ) => Effect.Effect<unknown, Error, Requirements>;
  /** Porteur type-only du contexte publié, dépendances transitives comprises. */
  readonly __contextOut?: ContextOut;
}

export type AnyCraftMiddleware = CraftMiddleware<
  string,
  readonly CraftSchema[],
  any,
  any,
  any
>;

export type MiddlewareSchemasOf<Middleware> = Middleware extends CraftMiddleware<
  any,
  infer Schemas,
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
  any
>
  ? Context
  : never;

export type MiddlewareErrorOf<Middleware> = Middleware extends CraftMiddleware<
  any,
  any,
  any,
  infer Error,
  any
>
  ? Error
  : never;

export type MiddlewareRequirementsOf<Middleware> =
  Middleware extends CraftMiddleware<any, any, any, any, infer Requirements>
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
> {
  /** Déclare une dépendance : son contexte, ses schémas et ses canaux sont hérités. */
  readonly use: <Middleware extends AnyCraftMiddleware>(
    middleware: Middleware,
  ) => CraftMiddlewareBuilder<
    Id,
    readonly [...Schemas, ...MiddlewareSchemasOf<Middleware>],
    OverwriteContext<ContextIn, MiddlewareContextOf<Middleware>>,
    Error | MiddlewareErrorOf<Middleware>,
    Requirements | MiddlewareRequirementsOf<Middleware>
  >;
  /** Ajoute un fragment d'input, fusionné dans celui de la server function. */
  readonly input: <Schema extends CraftSchema>(
    schema: Schema,
  ) => CraftMiddlewareBuilder<
    Id,
    readonly [...Schemas, Schema],
    ContextIn,
    Error,
    Requirements
  >;
  readonly server: <
    ContextOut extends MiddlewareContext,
    RunError,
    RunRequirements,
  >(
    run: (
      context: MiddlewareRunContext<Schemas, ContextIn>,
    ) => Effect.Effect<MiddlewareResult<ContextOut>, RunError, RunRequirements>,
  ) => CraftMiddleware<
    Id,
    Schemas,
    OverwriteContext<ContextIn, ContextOut>,
    Error | Exclude<RunError, MiddlewareDownstreamError>,
    Requirements | RunRequirements
  >;
}

export function craftMiddleware<const Id extends string>(
  id: Id,
): CraftMiddlewareBuilder<Id, readonly [], Record<never, never>, never, never> {
  assertMiddlewareId(id);
  return makeBuilder(id, [], []) as CraftMiddlewareBuilder<
    Id,
    readonly [],
    Record<never, never>,
    never,
    never
  >;
}

function makeBuilder(
  id: string,
  inputs: readonly CraftSchema[],
  dependencies: readonly AnyCraftMiddleware[],
): unknown {
  return {
    use(middleware: AnyCraftMiddleware) {
      return makeBuilder(
        id,
        [...inputs, ...middleware.inputs],
        [...dependencies, middleware],
      );
    },
    input(schema: CraftSchema) {
      return makeBuilder(id, [...inputs, schema], dependencies);
    },
    server(run: CraftMiddleware['run']) {
      return Object.freeze({
        kind: 'server-function-middleware' as const,
        id,
        inputs,
        dependencies,
        run,
      });
    },
  };
}

export function isCraftMiddleware(value: unknown): value is AnyCraftMiddleware {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'server-function-middleware'
  );
}

export function assertMiddlewareId(id: string): void {
  if (!/^[A-Za-z][A-Za-z0-9._:-]*$/.test(id)) {
    throw new Error(
      `Invalid middleware id "${id}". Use a stable dotted identifier.`,
    );
  }
}

/**
 * Aplatit les dépendances (profondeur d'abord) et déduplique par identifiant.
 *
 * La déduplication est silencieuse par construction : deux middleware de même
 * identifiant mais d'implémentation différente donneraient un typage juste et un
 * runtime faux, d'où le rejet explicite.
 */
export function flattenMiddlewares(
  middlewares: readonly AnyCraftMiddleware[],
): readonly AnyCraftMiddleware[] {
  const seen = new Map<string, AnyCraftMiddleware>();
  const ordered: AnyCraftMiddleware[] = [];

  const visit = (middleware: AnyCraftMiddleware): void => {
    const known = seen.get(middleware.id);
    if (known) {
      if (known !== middleware) {
        throw new Error(
          `Duplicate middleware id "${middleware.id}" with two different implementations.`,
        );
      }
      return;
    }
    seen.set(middleware.id, middleware);
    for (const dependency of middleware.dependencies) visit(dependency);
    ordered.push(middleware);
  };

  for (const middleware of middlewares) visit(middleware);
  return ordered;
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
): unknown {
  const chain = flattenMiddlewares(middlewares);

  const step = (index: number, context: MiddlewareContext): unknown => {
    const middleware = chain[index];
    if (!middleware) return handler({ input, context });
    return middleware.run({
      input: input as never,
      context,
      next: ((patch: { readonly context: MiddlewareContext }) =>
        step(index + 1, { ...context, ...patch.context })) as never,
    });
  };

  return step(0, {});
}
