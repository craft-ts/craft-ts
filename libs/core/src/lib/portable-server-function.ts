import {
  assertServerFunctionId,
  serverFunctionContract,
  type ServerFunctionContract,
  type ServerFunctionExposure,
} from './server-function-contract';
import type { ServerFunctionPipe } from './client-di-requirement';
import {
  collectMiddlewareClientContextSchemas,
  collectMiddlewareSchemas,
  flattenMiddlewares,
  type AnyCraftMiddleware,
  type MergedMiddlewareContext,
  type MiddlewareContextOf,
  type MiddlewareSchemasOf,
  type PortableServerMiddleware,
} from './server-function-middleware';
import {
  isServerLayer,
  runServerChain,
  type AnyServerLayer,
  type NoContextCollision,
  type ServerChainStep,
  type ServerLayer,
} from './server-layer';
import type {
  MergeSchemaOutputs,
  MiddlewareContext,
  OverwriteContext,
} from './middleware-schema-shared';
import type { CraftSchema } from './schema-validation';
import type {
  ServerFunctionDefinition,
  ServerFunctionHandlerContext,
  ServerFunctionRequired,
} from './server-function';

/**
 * A program is deliberately opaque to the core. It can be a Promise, a Task,
 * a TaskEither, an Effect value, or a synchronous application-defined value.
 */
export type ServerProgram<_Success = unknown, _Failure = unknown> = unknown;

export type ServerProgramAdapter<Program = unknown, Output = unknown> = {
  readonly run: (program: Program) => Output | Promise<Output>;
};

/** Useful when the selected program already is the value the registry needs. */
export const nativeServerProgramAdapter: ServerProgramAdapter = {
  run: (value) => value,
};

/** Short alias matching the terminology used in the design document. */
export const nativeAdapter = nativeServerProgramAdapter;

export type PortableServerFunctionHandlerContext<
  Contract extends ServerFunctionContract<any, any, any>,
  Pipes extends readonly ServerFunctionPipe[],
  Middlewares extends readonly AnyCraftMiddleware[],
  Schemas extends readonly CraftSchema[],
  Context extends MiddlewareContext = MergedMiddlewareContext<Middlewares>,
> = Omit<
  ServerFunctionHandlerContext<Contract, Pipes, Middlewares, Schemas>,
  'context'
> & {
  /** Contexte cumulé de la chaîne, dans l'ordre déclaré. */
  readonly context: Context;
};

export type PortableServerFunctionHandler<
  Contract extends ServerFunctionContract<any, any, any>,
  Pipes extends readonly ServerFunctionPipe[] = readonly ServerFunctionPipe[],
  Output = unknown,
  Middlewares extends readonly AnyCraftMiddleware[] = readonly [],
  Schemas extends readonly CraftSchema[] = readonly [Contract['input']],
  Context extends MiddlewareContext = MergedMiddlewareContext<Middlewares>,
> = (
  context: PortableServerFunctionHandlerContext<
    Contract,
    Pipes,
    Middlewares,
    Schemas,
    Context
  >,
) => Output;

/** Ce qu'une couche voit de l'input : la fusion des schémas déjà collectés. */
type LayerInput<Schemas extends readonly CraftSchema[]> =
  MergeSchemaOutputs<Schemas>;

/** Une couche acceptable ici, plus le refus des clés déjà produites. */
type PipeLayer<
  Schemas extends readonly CraftSchema[],
  Context extends MiddlewareContext,
  Added extends MiddlewareContext,
> = ServerLayer<LayerInput<Schemas>, Context, Added> &
  NoContextCollision<Context, Added>;

type Fold<
  Context extends MiddlewareContext,
  Added extends MiddlewareContext,
> = OverwriteContext<Context, Added>;

export type PortableServerFunctionBuilder<
  Contract extends ServerFunctionContract<any, any, any>,
  Pipes extends readonly ServerFunctionPipe[],
  Middlewares extends readonly AnyCraftMiddleware[] = readonly [],
  Schemas extends readonly CraftSchema[] = readonly [Contract['input']],
  Context extends MiddlewareContext = Record<never, never>,
> = {
  /**
   * Deux formes, distinguées par leur contrat et jamais mélangées :
   *
   * - un **pipe de contrat** (`requireServerPermission(...)`), qui ajoute une
   *   déclaration lue par le registre avant toute exécution ;
   * - une ou plusieurs **couches de programme**, composées en oignon dans
   *   l'ordre déclaré, chacune voyant le contexte cumulé par les précédentes.
   */
  readonly pipe: {
    <A extends MiddlewareContext>(
      a: PipeLayer<Schemas, Context, A>,
    ): PortableServerFunctionBuilder<
      Contract,
      Pipes,
      Middlewares,
      Schemas,
      Fold<Context, A>
    >;
    <A extends MiddlewareContext, B extends MiddlewareContext>(
      a: PipeLayer<Schemas, Context, A>,
      b: PipeLayer<Schemas, Fold<Context, A>, B>,
    ): PortableServerFunctionBuilder<
      Contract,
      Pipes,
      Middlewares,
      Schemas,
      Fold<Fold<Context, A>, B>
    >;
    <
      A extends MiddlewareContext,
      B extends MiddlewareContext,
      C extends MiddlewareContext,
    >(
      a: PipeLayer<Schemas, Context, A>,
      b: PipeLayer<Schemas, Fold<Context, A>, B>,
      c: PipeLayer<Schemas, Fold<Fold<Context, A>, B>, C>,
    ): PortableServerFunctionBuilder<
      Contract,
      Pipes,
      Middlewares,
      Schemas,
      Fold<Fold<Fold<Context, A>, B>, C>
    >;
    <
      A extends MiddlewareContext,
      B extends MiddlewareContext,
      C extends MiddlewareContext,
      D extends MiddlewareContext,
    >(
      a: PipeLayer<Schemas, Context, A>,
      b: PipeLayer<Schemas, Fold<Context, A>, B>,
      c: PipeLayer<Schemas, Fold<Fold<Context, A>, B>, C>,
      d: PipeLayer<Schemas, Fold<Fold<Fold<Context, A>, B>, C>, D>,
    ): PortableServerFunctionBuilder<
      Contract,
      Pipes,
      Middlewares,
      Schemas,
      Fold<Fold<Fold<Fold<Context, A>, B>, C>, D>
    >;
    <
      A extends MiddlewareContext,
      B extends MiddlewareContext,
      C extends MiddlewareContext,
      D extends MiddlewareContext,
      E extends MiddlewareContext,
    >(
      a: PipeLayer<Schemas, Context, A>,
      b: PipeLayer<Schemas, Fold<Context, A>, B>,
      c: PipeLayer<Schemas, Fold<Fold<Context, A>, B>, C>,
      d: PipeLayer<Schemas, Fold<Fold<Fold<Context, A>, B>, C>, D>,
      e: PipeLayer<Schemas, Fold<Fold<Fold<Fold<Context, A>, B>, C>, D>, E>,
    ): PortableServerFunctionBuilder<
      Contract,
      Pipes,
      Middlewares,
      Schemas,
      Fold<Fold<Fold<Fold<Fold<Context, A>, B>, C>, D>, E>
    >;
    /**
     * En dernier à dessein : une couche est un objet, jamais un pipe de
     * contrat, et laisser cette surcharge en tête ferait échouer une première
     * tentative de résolution — ce qui fige le type des callbacks contextuels
     * de `mapContext(...)` avant que le contexte cumulé soit connu.
     */
    <Pipe extends ServerFunctionPipe>(
      pipe: Pipe,
    ): PortableServerFunctionBuilder<
      Contract,
      readonly [...Pipes, Pipe],
      Middlewares,
      Schemas,
      Context
    >;
  };
  /**
   * Compatibilité : le moteur historique de middleware portables. Les nouveaux
   * exemples composent avec `.pipe(...)`, qui, lui, transmet le contexte typé.
   */
  readonly use: <
    Middleware extends PortableServerMiddleware<any, any, any, any, any, any>,
  >(
    middleware: Middleware,
  ) => PortableServerFunctionBuilder<
    Contract,
    Pipes,
    readonly [...Middlewares, Middleware],
    readonly [...Schemas, ...MiddlewareSchemasOf<Middleware>],
    OverwriteContext<Context, MiddlewareContextOf<Middleware>>
  >;
  readonly handler: <Output>(
    handler: PortableServerFunctionHandler<
      Contract,
      Pipes,
      Output,
      Middlewares,
      Schemas,
      Context
    >,
  ) => ServerFunctionDefinition<Contract, Pipes, Output, Middlewares>;
};

export function portableServerFunction<
  const Id extends string,
  Schema extends CraftSchema,
>(
  id: Id,
  input: Schema,
): PortableServerFunctionBuilder<
  ServerFunctionContract<Schema, 'server', undefined, Id>,
  readonly []
>;
export function portableServerFunction<
  const Id extends string,
  Schema extends CraftSchema,
  Exposure extends ServerFunctionExposure,
  OutputSchema extends CraftSchema | undefined = undefined,
  ClientContextSchema extends CraftSchema | undefined = undefined,
>(
  id: Id,
  input: Schema,
  options: {
    readonly exposure: Exposure;
    readonly output?: OutputSchema;
    readonly clientContext?: ClientContextSchema;
  },
): PortableServerFunctionBuilder<
  ServerFunctionContract<
    Schema,
    Exposure,
    OutputSchema,
    Id,
    ClientContextSchema
  >,
  readonly []
>;
export function portableServerFunction<
  Schema extends CraftSchema,
  Exposure extends ServerFunctionExposure,
  OutputSchema extends CraftSchema | undefined,
  ClientContextSchema extends CraftSchema | undefined = CraftSchema | undefined,
>(
  contract: ServerFunctionContract<
    Schema,
    Exposure,
    OutputSchema,
    string,
    ClientContextSchema
  >,
): PortableServerFunctionBuilder<
  ServerFunctionContract<
    Schema,
    Exposure,
    OutputSchema,
    string,
    ClientContextSchema
  >,
  readonly []
>;
export function portableServerFunction(
  contractOrId: string | ServerFunctionContract,
  input?: CraftSchema,
  options?: {
    readonly exposure?: ServerFunctionExposure;
    readonly output?: CraftSchema;
    readonly clientContext?: CraftSchema;
  },
): PortableServerFunctionBuilder<any, readonly []> {
  const contract = (
    typeof contractOrId === 'string'
      ? serverFunctionContract({
          id: contractOrId,
          input: input as CraftSchema,
          exposure: options?.exposure ?? 'server',
          output: options?.output,
          clientContext: options?.clientContext,
        })
      : contractOrId
  ) as ServerFunctionContract;
  assertServerFunctionId(contract.id);

  return createPortableBuilder(
    contract,
    [] as readonly [],
    [] as readonly [],
    [] as readonly [],
  ) as never;
}

/** Une étape de la chaîne, dans l'ordre où elle a été déclarée. */
type PortableStep = AnyCraftMiddleware | AnyServerLayer;

function createPortableBuilder<
  Contract extends ServerFunctionContract<any, any, any>,
  Pipes extends readonly ServerFunctionPipe[],
  Middlewares extends readonly AnyCraftMiddleware[],
>(
  contract: Contract,
  pipes: Pipes,
  middlewares: Middlewares,
  steps: readonly PortableStep[],
): PortableServerFunctionBuilder<Contract, Pipes, Middlewares> {
  return {
    pipe(...args: readonly unknown[]) {
      const nextPipes = [...pipes] as ServerFunctionPipe[];
      const nextSteps = [...steps];
      for (const argument of args) {
        if (isServerLayer(argument)) nextSteps.push(argument);
        else nextPipes.push(argument as ServerFunctionPipe);
      }
      return createPortableBuilder(
        contract,
        nextPipes as readonly ServerFunctionPipe[],
        middlewares,
        nextSteps,
      ) as never;
    },
    use(middleware: AnyCraftMiddleware) {
      return createPortableBuilder(
        contract,
        pipes,
        [...middlewares, middleware] as readonly [
          ...Middlewares,
          typeof middleware,
        ],
        [...steps, middleware as AnyCraftMiddleware],
      ) as never;
    },
    handler(handler: PortableServerFunctionHandler<Contract, Pipes, unknown>) {
      return createPortableDefinition(
        contract,
        pipes,
        middlewares,
        steps,
        handler as never,
      ) as never;
    },
  } as unknown as PortableServerFunctionBuilder<Contract, Pipes, Middlewares>;
}

/**
 * Aplatit les dépendances des middleware sans perdre l'ordre de déclaration,
 * et sans exécuter deux fois un middleware partagé par deux branches.
 */
function expandSteps(steps: readonly PortableStep[]): readonly ServerChainStep[] {
  const seen = new Set<string>();
  const expanded: ServerChainStep[] = [];
  for (const step of steps) {
    if (isServerLayer(step)) {
      expanded.push(step as unknown as ServerChainStep);
      continue;
    }
    for (const middleware of flattenMiddlewares([step])) {
      if (seen.has(middleware.id)) continue;
      seen.add(middleware.id);
      expanded.push(middleware as unknown as ServerChainStep);
    }
  }
  return expanded;
}

function createPortableDefinition<
  Contract extends ServerFunctionContract<any, any, any>,
  Pipes extends readonly ServerFunctionPipe[],
  Middlewares extends readonly AnyCraftMiddleware[],
  Output,
>(
  contract: Contract,
  pipes: Pipes,
  middlewares: Middlewares,
  steps: readonly PortableStep[],
  handler: PortableServerFunctionHandler<Contract, Pipes, Output, Middlewares>,
): ServerFunctionDefinition<Contract, Pipes, Output, Middlewares> {
  const chain = expandSteps(steps);
  return {
    kind: 'server-function',
    programMode: 'portable',
    contract,
    pipes,
    middlewares,
    layers: steps.filter(isServerLayer),
    inputSchemas: collectMiddlewareSchemas(contract.input, middlewares),
    clientContextSchemas: collectMiddlewareClientContextSchemas(
      contract.clientContext as CraftSchema | undefined,
      middlewares,
    ),
    handler: handler as never,
    invoke(input, runtime, clientContext) {
      const resolve: ServerFunctionRequired = (token) => {
        if (!runtime?.resolve) {
          throw new Error(
            `Server function "${contract.id}" requires DI, but no server runtime resolver was provided.`,
          );
        }
        return runtime.resolve(token);
      };
      const call = (context: MiddlewareContext): Output =>
        handler({
          input: input as never,
          context: context as never,
          clientContext: (clientContext ?? {}) as never,
          required: resolve,
          pipes,
        } as never);

      if (chain.length === 0) return call({});
      return runServerChain(
        chain,
        { input, clientContext: clientContext ?? {} },
        call,
        resolve,
      ) as Output;
    },
  };
}
