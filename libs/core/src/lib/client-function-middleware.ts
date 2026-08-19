import {
  flattenMiddlewareGraph,
  type MergeSchemaOutputs,
  type MiddlewareContext,
  type MiddlewareResult,
} from './middleware-schema-shared';
import { executeGeneratorCompatibleFactoryAsync } from './craft-program-runtime';
import { CraftGenShortCircuit } from './craft-gen';
import type { Injector } from './host/craft-compat';
import type { CraftSchema } from './schema-validation';

/**
 * Middleware **client** d'une server function : le pendant navigateur du
 * middleware serveur, déclaré par `craftMiddleware(id).client(run)`.
 *
 * Deux différences assumées avec la famille serveur :
 *
 * - `run` est un **générateur craft nu** (`function* ({ next }) { ... }`), pas
 *   un Effect : c'est la même famille que les guards `canActivate`/`canMatch`,
 *   et le core reste sans dépendance runtime sur Effect côté client comme côté
 *   serveur. Un `yield* someEffect` reste possible si le pont Effect est
 *   installé dans l'application ;
 * - ce qu'il publie n'est **pas** de la donnée de confiance : le contexte est
 *   transporté au serveur, revalidé par schéma, et atterrit dans un champ
 *   distinct (`clientContext`) pour que le handler ne le confonde jamais avec
 *   le contexte produit par la chaîne serveur.
 */
export type ClientMiddlewareNext = <Context extends MiddlewareContext>(patch: {
  readonly context: Context;
}) => Generator<unknown, MiddlewareResult<Context>, unknown>;

export type ClientMiddlewareRunContext<
  ContextIn extends MiddlewareContext = MiddlewareContext,
> = {
  /** L'input passé à la façade client, tel quel : il n'est pas validé ici. */
  readonly input: unknown;
  readonly context: ContextIn;
  readonly next: ClientMiddlewareNext;
};

export interface CraftClientMiddleware<
  Id extends string = string,
  Provides extends readonly CraftSchema[] = readonly CraftSchema[],
  ContextOut extends MiddlewareContext = MiddlewareContext,
> {
  readonly kind: 'client-function-middleware';
  readonly id: Id;
  /** Schémas déclarés par `.provides(...)`, dépendances comprises. */
  readonly provides: Provides;
  readonly dependencies: readonly AnyCraftClientMiddleware[];
  readonly run: (
    context: ClientMiddlewareRunContext,
  ) => Generator<unknown, unknown, unknown>;
  /** Porteur type-only du contexte publié, dépendances transitives comprises. */
  readonly __clientContextOut?: ContextOut;
}

export type AnyCraftClientMiddleware = CraftClientMiddleware<
  string,
  readonly CraftSchema[],
  any
>;

export type ClientMiddlewareProvidesOf<Middleware> =
  Middleware extends CraftClientMiddleware<any, infer Provides, any>
    ? Provides
    : readonly [];

export type ClientMiddlewareContextOf<Middleware> =
  Middleware extends CraftClientMiddleware<any, any, infer Context>
    ? Context
    : never;

/** Concatène les schémas `.provides(...)` d'une liste de middleware client. */
export type ClientMiddlewareProvidesOfAll<
  Middlewares extends readonly AnyCraftClientMiddleware[],
> = Middlewares extends readonly [
  infer Head extends AnyCraftClientMiddleware,
  ...infer Tail extends readonly AnyCraftClientMiddleware[],
]
  ? readonly [
      ...ClientMiddlewareProvidesOf<Head>,
      ...ClientMiddlewareProvidesOfAll<Tail>,
    ]
  : readonly [];

/** Contexte publié par une liste de middleware client, fusionné dans l'ordre. */
export type MergedClientMiddlewareContext<
  Middlewares extends readonly AnyCraftClientMiddleware[],
> = Middlewares extends readonly [
  infer Head extends AnyCraftClientMiddleware,
  ...infer Tail extends readonly AnyCraftClientMiddleware[],
]
  ? ClientMiddlewareContextOf<Head> & MergedClientMiddlewareContext<Tail>
  : Record<never, never>;

export function isCraftClientMiddleware(
  value: unknown,
): value is AnyCraftClientMiddleware {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'client-function-middleware'
  );
}

export function flattenClientMiddlewares(
  middlewares: readonly AnyCraftClientMiddleware[],
): readonly AnyCraftClientMiddleware[] {
  return flattenMiddlewareGraph(middlewares);
}

/** Schémas `.provides(...)` collectés le long de la chaîne, dédupliqués. */
export function collectClientMiddlewareSchemas(
  middlewares: readonly AnyCraftClientMiddleware[],
): readonly CraftSchema[] {
  const schemas: CraftSchema[] = [];
  for (const middleware of flattenClientMiddlewares(middlewares)) {
    for (const schema of middleware.provides) {
      if (!schemas.includes(schema)) schemas.push(schema);
    }
  }
  return schemas;
}

export class ClientFunctionContextError extends Error {
  readonly code = 'CRAFT_CLIENT_FUNCTION_CONTEXT_INVALID';
  readonly id: string;
  readonly issues: readonly { readonly message: string }[];

  constructor(id: string, issues: readonly { readonly message: string }[]) {
    super(
      `CRAFT_CLIENT_FUNCTION_CONTEXT_INVALID: client middleware chain of "${id}" produced an invalid context: ${issues
        .map((issue) => issue.message)
        .join(', ')}`,
    );
    this.id = id;
    this.issues = issues;
    this.name = 'ClientFunctionContextError';
  }
}

/**
 * Compose la chaîne client en oignon, comme `runMiddlewareChain` côté serveur,
 * mais en pilotant des générateurs craft : le générateur retourné relaie les
 * `yield` de chaque étape à l'hôte (`craftUse`, un loader, un guard…) et
 * résout au contexte accumulé.
 *
 * Le brand `MiddlewareResult` reste purement type-level : à l'exécution, la
 * valeur qui remonte est déjà le contexte final, qu'un middleware peut donc
 * observer — voire remplacer — après l'appel à `next()`.
 */
export function runClientMiddlewareChain(
  middlewares: readonly AnyCraftClientMiddleware[],
  input: unknown,
): Generator<unknown, MiddlewareContext, unknown> {
  const chain = flattenClientMiddlewares(middlewares);

  function* step(
    index: number,
    context: MiddlewareContext,
  ): Generator<unknown, MiddlewareContext, unknown> {
    const middleware = chain[index];
    if (!middleware) return context;
    const result = yield* middleware.run({
      input,
      context,
      next: ((patch: { readonly context: MiddlewareContext }) =>
        step(index + 1, { ...context, ...patch.context })) as never,
    });
    return result as MiddlewareContext;
  }

  return step(0, {});
}

const INVALID_YIELD_ERROR_MESSAGE =
  'A client function middleware can only yield craft dependencies, craft primitives, or — with the Effect bridge installed — an Effect.';

/**
 * Drive la chaîne sur la pompe **asynchrone** de craft.
 *
 * Le choix est délibéré : un middleware client lit typiquement une session, un
 * profil, une préférence — des choses qu'un pont (l'adaptateur Effect, par
 * exemple) résout de façon asynchrone. La pompe async restaure le contexte
 * d'injection après chaque `await`, ce qu'un `craftUse` synchrone ne peut pas
 * faire.
 */
export async function runClientMiddlewareChainAsync(
  middlewares: readonly AnyCraftClientMiddleware[],
  input: unknown,
  injector: Injector,
): Promise<MiddlewareContext> {
  const settled = await executeGeneratorCompatibleFactoryAsync({
    factory: () => runClientMiddlewareChain(middlewares, input),
    thisArg: undefined,
    getInjector: () => injector,
    args: [],
    invalidYieldErrorMessage: INVALID_YIELD_ERROR_MESSAGE,
  });
  if (settled.kind === 'shortCircuit') {
    throw new CraftGenShortCircuit(settled.exception);
  }
  return (settled.value ?? {}) as MiddlewareContext;
}

/**
 * Vérifie que la chaîne a bien produit ce que ses `.provides(...)` annoncent.
 *
 * C'est un garde-fou de développement, pas la garantie de sécurité : la vraie
 * validation est celle du serveur, qui ne fait jamais confiance au navigateur.
 */
export async function validateClientContext(
  id: string,
  schemas: readonly CraftSchema[],
  context: MiddlewareContext,
): Promise<void> {
  for (const schema of schemas) {
    const result = await schema['~standard'].validate(context);
    if (result.issues) throw new ClientFunctionContextError(id, result.issues);
  }
}

export type ClientMiddlewareContextOfSchemas<
  Schemas extends readonly CraftSchema[],
> = MergeSchemaOutputs<Schemas>;
