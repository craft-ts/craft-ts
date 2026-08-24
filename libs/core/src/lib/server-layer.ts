import {
  assertMiddlewareId,
  type MiddlewareContext,
  type OverwriteContext,
} from './middleware-schema-shared';
import type { ServerFunctionToken } from './client-di-requirement';

/**
 * Composition des server functions portables — la contrepartie générique de
 * `craftMiddleware(...).server(...)`, qui, lui, ne sait parler qu'Effect.
 *
 * Trois canaux, jamais fusionnés : `input` (validé par les schémas), `context`
 * (produit par les couches, donc de confiance) et `clientContext` (déclaré par
 * le navigateur, donc à confronter). Une couche ne mute rien : elle passe un
 * enveloppe enrichi à la suivante via `next`.
 *
 * Le programme exécuté reste opaque pour le core : Promise, Task, valeur
 * synchrone ou autre. Rien n'est `await`é ici sans qu'un adapter l'ait dit.
 */

/** L'enveloppe transmise de couche en couche, immuable par construction. */
export type ServerEnvelope<
  Input = unknown,
  Context extends MiddlewareContext = MiddlewareContext,
  ClientContext extends MiddlewareContext = MiddlewareContext,
> = {
  readonly input: Input;
  readonly context: Context;
  readonly clientContext: ClientContext;
};

declare const PROGRAM_SUCCESS: unique symbol;

/**
 * Porteur type-only du succès d'un programme applicatif.
 *
 * Une Promise dit déjà ce qu'elle produit ; une `Task`, un `TaskEither` ou tout
 * autre protocole maison ne le disent pas dans une forme que le core sache
 * lire. Les faire hériter de cette interface — champ optionnel, donc zéro coût
 * runtime — suffit à rendre leur canal de succès visible.
 *
 * @example
 * type Task<A> = { readonly run: () => Promise<A> } & ServerProgramSuccess<A>;
 */
export interface ServerProgramSuccess<Success> {
  readonly [PROGRAM_SUCCESS]?: Success;
}

/**
 * Le canal de succès d'un programme : le porteur explicite s'il existe, sinon
 * la Promise, sinon la valeur elle-même (programme synchrone).
 *
 * La garde `typeof PROGRAM_SUCCESS extends keyof Program` n'est pas décorative :
 * un `extends ServerProgramSuccess<infer S>` seul matche **tout** type, porteur
 * ou non, et renverrait `unknown` pour les autres.
 */
export type ProgramSuccessOf<Program> = typeof PROGRAM_SUCCESS extends keyof Program
  ? Program extends ServerProgramSuccess<infer Success>
    ? Success
    : never
  : Program extends PromiseLike<infer Success>
    ? Success
    : Program;

declare const LAYER_RESULT: unique symbol;

/**
 * Résultat opaque de `next()`, porteur du contexte que la couche ajoute.
 *
 * Même pivot d'inférence que les résultats yieldables : TypeScript ne déduit rien de
 * l'argument passé à un paramètre, mais tout du type retourné. Conséquence
 * utile : ce type n'est constructible que par `next()`, donc une couche ne peut
 * pas réussir sans avoir appelé la suite de la chaîne.
 */
export interface ServerLayerResult<Context extends MiddlewareContext> {
  readonly [LAYER_RESULT]: Context;
}

/**
 * Le contexte enrichi qu'une couche publie, lu dans le type de son programme.
 *
 * `async ({ next }) => next({ context: { user } })` a pour type de retour
 * `Promise<ServerLayerResult<{ user: User }>>` : l'enrichissement est donc
 * déclaré et vérifié, sans que l'auteur ait à l'écrire deux fois.
 */
export type ServerLayerAdded<Program> =
  ProgramSuccessOf<Program> extends ServerLayerResult<infer Context>
    ? Context extends MiddlewareContext
      ? Context
      : Record<never, never>
    : Record<never, never>;

export type ServerLayerNext = <
  Added extends MiddlewareContext,
  Program = PromiseLike<ServerLayerResult<Added>>,
>(patch: {
  readonly context: Added;
}) => Program;

export type ServerLayerRunContext<
  Input = unknown,
  Context extends MiddlewareContext = MiddlewareContext,
  ClientContext extends MiddlewareContext = MiddlewareContext,
> = ServerEnvelope<Input, Context, ClientContext> & {
  /**
   * Passe la main à la couche suivante avec un contexte enrichi. Le patch est
   * fusionné dans le contexte cumulé : l'aval voit tout, jamais le seul patch.
   */
  readonly next: ServerLayerNext;
  /** Résout une dépendance dans le runtime serveur de la server function. */
  readonly resolve: <Value>(token: ServerFunctionToken<Value>) => Value;
};

export type ServerLayerRun = (
  context: ServerLayerRunContext<any, any, any>,
) => unknown;

/**
 * Une couche de composition.
 *
 * Les trois paramètres sont des porteurs type-only : `Input` en position
 * bivariante (une couche qui ne lit pas l'input s'insère dans n'importe quelle
 * fonction), `ContextIn` en position covariante — c'est lui qui refuse une
 * couche branchée trop tôt — et `Added` que `.pipe(...)` replie.
 */
export interface ServerLayer<
  Input = unknown,
  ContextIn extends MiddlewareContext = MiddlewareContext,
  Added extends MiddlewareContext = MiddlewareContext,
> {
  readonly kind: 'server-layer';
  readonly id: string;
  readonly run: ServerLayerRun;
  /** Volontairement une méthode : la bivariance est ce qui rend `Input` libre. */
  __input?(input: Input): void;
  readonly __contextIn?: ContextIn;
  readonly __added?: Added;
}

export type AnyServerLayer = ServerLayer<any, any, any>;

export type ServerLayerAddedOf<Layer> =
  Layer extends ServerLayer<any, any, infer Added> ? Added : Record<never, never>;

export function isServerLayer(value: unknown): value is AnyServerLayer {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'server-layer'
  );
}

/**
 * Déclare une couche qui n'a besoin d'aucun contexte amont.
 *
 * @example
 * const withMatchingUser = serverLayer('demo.matching-user', async ({ next, resolve }) => {
 *   const user = resolve(CurrentUser);
 *   return next({ context: { user } });
 * });
 */
export function serverLayer<const Id extends string, Program>(
  id: Id,
  run: (
    context: ServerLayerRunContext<unknown, Record<never, never>>,
  ) => Program,
): ServerLayer<unknown, Record<never, never>, ServerLayerAdded<Program>> {
  assertMiddlewareId(id);
  return Object.freeze({
    kind: 'server-layer' as const,
    id,
    run: run as ServerLayerRun,
  });
}

/**
 * Même chose, pour une couche qui **lit** ce qu'une couche amont a produit.
 *
 * Curryfié à dessein : TypeScript n'accepte pas une liste partielle
 * d'arguments de type, et donner `ContextIn` explicitement écraserait
 * l'inférence du programme retourné.
 *
 * @example
 * const withPermissions = serverLayerReading<{ user: User }>()(
 *   'demo.permissions',
 *   async ({ context, next }) => next({ context: { canEdit: context.user.role === 'admin' } }),
 * );
 */
export function serverLayerReading<
  ContextIn extends MiddlewareContext,
  Input = unknown,
>(): <const Id extends string, Program>(
  id: Id,
  run: (context: ServerLayerRunContext<Input, ContextIn>) => Program,
) => ServerLayer<Input, ContextIn, ServerLayerAdded<Program>> {
  return (id, run) => {
    assertMiddlewareId(id);
    return Object.freeze({
      kind: 'server-layer' as const,
      id,
      run: run as ServerLayerRun,
    });
  };
}

/**
 * Dérivation pure et synchrone : les clés retournées sont fusionnées dans le
 * contexte cumulé.
 *
 * Une valeur scalaire n'est pas acceptée — elle ne donne aucune clé à inférer,
 * et l'aval ne saurait pas sous quel nom la lire.
 */
export function mapContext<
  Input,
  ContextIn extends MiddlewareContext,
  Added extends MiddlewareContext,
>(
  project: (envelope: ServerEnvelope<Input, ContextIn>) => Added,
): ServerLayer<Input, ContextIn, Added> {
  return Object.freeze({
    kind: 'server-layer' as const,
    id: 'craft.map-context',
    run: (({ next, ...envelope }) =>
      next({
        context: assertContextPatch('mapContext', project(envelope as never)),
      })) as ServerLayerRun,
  });
}

/**
 * Enchaîne deux programmes dans le protocole de l'application.
 *
 * Le core n'en connaît aucun : il reçoit la continuation et rend la main.
 */
export type ServerProgramChain<Program = unknown> = (
  program: Program,
  continuation: (value: ProgramSuccessOf<Program>) => Program,
) => Program;

/**
 * L'enchaînement des Promise, seul protocole que le core connaisse d'origine.
 * Tout autre — `Task`, `TaskEither` — se branche en passant le sien.
 */
export const promiseProgramChain: ServerProgramChain = (
  program,
  continuation,
) => Promise.resolve(program).then(continuation as (value: unknown) => unknown);

/**
 * Dérivation qui doit exécuter un programme — Promise, Task, ou autre — avant
 * de fusionner son résultat dans le contexte.
 *
 * `chain` est le seul endroit qui sait séquencer le protocole choisi : le core
 * n'`await` jamais une valeur dont il ignore le contrat.
 *
 * @example
 * flatMapContext(({ context }) => loadPermissions(context.userId))
 * flatMapContext(({ context }) => loadTask(context.userId), taskChain)
 */
export function flatMapContext<Input, ContextIn extends MiddlewareContext, Program>(
  project: (envelope: ServerEnvelope<Input, ContextIn>) => Program,
  chain: ServerProgramChain<Program> = promiseProgramChain as ServerProgramChain<Program>,
): ServerLayer<
  Input,
  ContextIn,
  ProgramSuccessOf<Program> extends MiddlewareContext
    ? ProgramSuccessOf<Program>
    : Record<never, never>
> {
  return Object.freeze({
    kind: 'server-layer' as const,
    id: 'craft.flat-map-context',
    run: (({ next, ...envelope }) =>
      chain(project(envelope as never), ((value: unknown) =>
        next({
          context: assertContextPatch('flatMapContext', value),
        })) as never)) as ServerLayerRun,
  });
}

/**
 * Le typage refuse déjà un scalaire ; ce garde-fou protège les appelants
 * JavaScript et, surtout, transforme un `undefined` distrait en message clair
 * plutôt qu'en contexte silencieusement vidé.
 */
function assertContextPatch(
  operator: string,
  value: unknown,
): MiddlewareContext {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(
      `CRAFT_SERVER_LAYER_CONTEXT_PATCH_INVALID: ${operator}(...) must return an object of context keys, received ${value === null ? 'null' : typeof value}.`,
    );
  }
  return value as MiddlewareContext;
}

/**
 * Ce qu'une étape de chaîne doit savoir faire, couche ou middleware confondus :
 * les deux reçoivent la même enveloppe et la même continuation.
 */
export type ServerChainStep = {
  readonly id: string;
  readonly run: ServerLayerRun;
};

/**
 * Compose la chaîne en oignon, dans l'ordre déclaré. Aucun combinateur : la
 * valeur qui remonte est celle du handler, et le core reste sans dépendance
 * runtime sur un quelconque protocole de programme.
 */
export function runServerChain(
  steps: readonly ServerChainStep[],
  envelope: {
    readonly input: unknown;
    readonly clientContext: MiddlewareContext;
  },
  handler: (context: MiddlewareContext) => unknown,
  resolve: <Value>(token: ServerFunctionToken<Value>) => Value,
): unknown {
  const step = (index: number, context: MiddlewareContext): unknown => {
    const current = steps[index];
    if (!current) return handler(context);
    return current.run({
      input: envelope.input,
      context,
      clientContext: envelope.clientContext,
      resolve,
      // `next` promet à l'auteur le type de programme qu'il a choisi ; le
      // runtime, lui, ne rend que la valeur de l'aval — d'où le seul cast.
      next: ((patch: { readonly context?: MiddlewareContext }) =>
        step(index + 1, { ...context, ...patch?.context })) as ServerLayerNext,
    });
  };
  return step(0, {});
}

/** Fold ordonné des couches d'un `.pipe(...)` : la dernière gagne. */
export type FoldServerLayers<
  Context extends MiddlewareContext,
  Layers extends readonly AnyServerLayer[],
> = Layers extends readonly [
  infer Head extends AnyServerLayer,
  ...infer Tail extends readonly AnyServerLayer[],
]
  ? FoldServerLayers<OverwriteContext<Context, ServerLayerAddedOf<Head>>, Tail>
  : Context;

/**
 * Refuse une couche qui redéclare une clé déjà produite en amont.
 *
 * Écraser silencieusement serait le pire des deux mondes : le type dirait la
 * vérité, le lecteur croirait l'inverse. Le diagnostic nomme la clé fautive.
 */
export type NoContextCollision<
  Context extends MiddlewareContext,
  Added extends MiddlewareContext,
> = [Extract<keyof Added, keyof Context>] extends [never]
  ? unknown
  : {
      readonly [Key in 'craft: this layer re-declares a context key produced upstream']: Extract<
        keyof Added,
        keyof Context
      >;
    };
