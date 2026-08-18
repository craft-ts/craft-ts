import {
  assertServerFunctionId,
  serverFunctionContract,
  type ServerFunctionContract,
  type ServerFunctionExposure,
} from './server-function-contract';
import {
  type ClientDIRequirement,
  type ClientDITokensOf,
  type ClientDIRequirementOf,
  type ServerFunctionPipe,
  type ServerFunctionToken,
} from './client-di-requirement';
import {
  collectMiddlewareSchemas,
  runMiddlewareChain,
  type AnyCraftMiddleware,
  type MergedMiddlewareContext,
  type MergedMiddlewareError,
  type MergedMiddlewareRequirements,
  type MergeSchemaInputs,
  type MergeSchemaOutputs,
  type MiddlewareSchemasOf,
  type MiddlewareSchemasOfAll,
} from './server-function-middleware';
import type { CraftSchema } from './schema-validation';
import type * as Effect from 'effect/Effect';

export type ServerFunctionRequired<
  Pipes extends readonly ServerFunctionPipe[] = readonly ServerFunctionPipe[],
> = <Value>(token: ServerFunctionToken<Value> & ClientDITokensOf<Pipes>) => Value;

export type ServerFunctionHandlerContext<
  Contract extends ServerFunctionContract<any, any, any>,
  Pipes extends readonly ServerFunctionPipe[] = readonly ServerFunctionPipe[],
  Middlewares extends readonly AnyCraftMiddleware[] = readonly [],
  Schemas extends readonly CraftSchema[] = readonly [Contract['input']],
> = {
  /**
   * Input validé : la fusion des sorties du schéma du contrat et de tous les
   * schémas déclarés par les middleware de la chaîne.
   */
  readonly input: MergeSchemaOutputs<Schemas>;
  /** Contexte produit par la chaîne de middleware, fusionné dans l'ordre. */
  readonly context: MergedMiddlewareContext<Middlewares>;
  readonly required: ServerFunctionRequired<Pipes>;
  readonly pipes: Pipes;
};

export type ServerFunctionHandler<
  Contract extends ServerFunctionContract<any, any, any>,
  Pipes extends readonly ServerFunctionPipe[] = readonly ServerFunctionPipe[],
  Output = unknown,
  Middlewares extends readonly AnyCraftMiddleware[] = readonly [],
  Schemas extends readonly CraftSchema[] = readonly [Contract['input']],
> = (
  context: ServerFunctionHandlerContext<Contract, Pipes, Middlewares, Schemas>,
) => Output;

export type ServerFunctionDefinition<
  Contract extends ServerFunctionContract<any, any, any> = ServerFunctionContract,
  Pipes extends readonly ServerFunctionPipe[] = readonly ServerFunctionPipe[],
  Output = unknown,
  Middlewares extends readonly AnyCraftMiddleware[] = readonly AnyCraftMiddleware[],
> = {
  readonly kind: 'server-function';
  readonly contract: Contract;
  readonly pipes: Pipes;
  readonly middlewares: Middlewares;
  /** Schéma du contrat suivi de ceux des middleware, dédupliqués. */
  readonly inputSchemas: readonly CraftSchema[];
  readonly handler: ServerFunctionHandler<Contract, Pipes, Output, Middlewares>;
  readonly invoke: (
    input: unknown,
    runtime?: ServerFunctionRuntime,
  ) => Output | Promise<Output>;
};

export type ServerFunctionRuntime = {
  readonly resolve?: <Value>(token: ServerFunctionToken<Value>) => Value;
};

/**
 * Dès qu'un middleware est branché, le handler doit renvoyer un Effect : c'est
 * le seul moyen de composer la chaîne sans que le core dépende d'Effect au
 * runtime.
 */
type HandlerOutputConstraint<
  Middlewares extends readonly AnyCraftMiddleware[],
> = Middlewares extends readonly [] ? unknown : Effect.Effect<any, any, any>;

/** Injecte les canaux d'erreur et de dépendances des middleware dans la sortie. */
type ComposedOutput<
  Middlewares extends readonly AnyCraftMiddleware[],
  Output,
> = Middlewares extends readonly []
  ? Output
  : Output extends Effect.Effect<
        infer Success,
        infer Error,
        infer Requirements
      >
    ? Effect.Effect<
        Success,
        Error | MergedMiddlewareError<Middlewares>,
        Requirements | MergedMiddlewareRequirements<Middlewares>
      >
    : Output;

type Builder<
  Contract extends ServerFunctionContract<any, any, any>,
  Pipes extends readonly ServerFunctionPipe[],
  Middlewares extends readonly AnyCraftMiddleware[] = readonly [],
  Schemas extends readonly CraftSchema[] = readonly [Contract['input']],
> = {
  readonly pipe: <Pipe extends ServerFunctionPipe>(
    pipe: Contract['exposure'] extends 'server'
      ? Pipe extends ClientDIRequirement
        ? never
        : Pipe
      : Pipe,
  ) => Builder<Contract, readonly [...Pipes, Pipe], Middlewares, Schemas>;
  readonly use: <Middleware extends AnyCraftMiddleware>(
    middleware: Middleware,
  ) => Builder<
    Contract,
    Pipes,
    readonly [...Middlewares, Middleware],
    readonly [...Schemas, ...MiddlewareSchemasOf<Middleware>]
  >;
  readonly handler: <Output extends HandlerOutputConstraint<Middlewares>>(
    handler: ServerFunctionHandler<
      Contract,
      Pipes,
      Output,
      Middlewares,
      Schemas
    >,
  ) => ServerFunctionDefinition<
    Contract,
    Pipes,
    ComposedOutput<Middlewares, Output>,
    Middlewares
  >;
};

export function serverFunction<const Id extends string, Schema extends CraftSchema>(
  id: Id,
  input: Schema,
): Builder<ServerFunctionContract<Schema, 'server', undefined, Id>, readonly []>;
export function serverFunction<
  const Id extends string,
  Schema extends CraftSchema,
  Exposure extends ServerFunctionExposure,
  OutputSchema extends CraftSchema | undefined = undefined,
>(
  id: Id,
  input: Schema,
  options: {
    readonly exposure: Exposure;
    readonly output?: OutputSchema;
  },
): Builder<
  ServerFunctionContract<Schema, Exposure, OutputSchema, Id>,
  readonly []
>;
export function serverFunction<
  Schema extends CraftSchema,
  Exposure extends ServerFunctionExposure,
  OutputSchema extends CraftSchema | undefined,
>(
  contract: ServerFunctionContract<Schema, Exposure, OutputSchema>,
): Builder<
  ServerFunctionContract<Schema, Exposure, OutputSchema>,
  readonly []
>;
export function serverFunction<
  const Id extends string,
  Schema extends CraftSchema,
  Exposure extends ServerFunctionExposure,
  OutputSchema extends CraftSchema | undefined = undefined,
>(
  contractOrId:
    | Id
    | ServerFunctionContract<Schema, Exposure, OutputSchema>,
  input?: Schema,
  options?: {
    readonly exposure?: Exposure;
    readonly output?: OutputSchema;
  },
): Builder<
  ServerFunctionContract<Schema, Exposure, OutputSchema, Id>,
  readonly []
> {
  const contract = (
    typeof contractOrId === 'string'
      ? serverFunctionContract({
          id: contractOrId,
          input: input as Schema,
          exposure: options?.exposure ?? 'server',
          output: options?.output,
        })
      : contractOrId
  ) as ServerFunctionContract<Schema, Exposure, OutputSchema, Id>;
  assertServerFunctionId(contract.id);

  return createBuilder(contract, [] as readonly [], [] as readonly []);
}

function createBuilder<
  Contract extends ServerFunctionContract<any, any, any>,
  Pipes extends readonly ServerFunctionPipe[],
  Middlewares extends readonly AnyCraftMiddleware[],
>(
  contract: Contract,
  pipes: Pipes,
  middlewares: Middlewares,
): Builder<Contract, Pipes, Middlewares> {
  return {
    pipe(pipe: ServerFunctionPipe) {
      return createBuilder(
        contract,
        [...pipes, pipe] as readonly [...Pipes, ServerFunctionPipe],
        middlewares,
      ) as never;
    },
    use(middleware: AnyCraftMiddleware) {
      return createBuilder(contract, pipes, [
        ...middlewares,
        middleware,
      ] as readonly [...Middlewares, typeof middleware]) as never;
    },
    handler(handler: ServerFunctionHandler<Contract, Pipes, unknown, Middlewares>) {
      return createDefinition(contract, pipes, middlewares, handler) as never;
    },
  } as unknown as Builder<Contract, Pipes, Middlewares>;
}

function createDefinition<
  Contract extends ServerFunctionContract<any, any, any>,
  Pipes extends readonly ServerFunctionPipe[],
  Middlewares extends readonly AnyCraftMiddleware[],
  Output,
>(
  contract: Contract,
  pipes: Pipes,
  middlewares: Middlewares,
  handler: ServerFunctionHandler<Contract, Pipes, Output, Middlewares>,
): ServerFunctionDefinition<Contract, Pipes, Output, Middlewares> {
  return {
    kind: 'server-function',
    contract,
    pipes,
    middlewares,
    inputSchemas: collectMiddlewareSchemas(contract.input, middlewares),
    handler,
    invoke(input, runtime) {
      const required: ServerFunctionRequired<Pipes> = (token) => {
        if (!runtime?.resolve) {
          throw new Error(
            `Server function "${contract.id}" requires DI, but no server runtime resolver was provided.`,
          );
        }
        return runtime.resolve(token);
      };
      const call = (context: Record<string, unknown>): Output =>
        handler({
          input: input as never,
          context: context as never,
          required,
          pipes,
        });

      if (middlewares.length === 0) return call({});
      return runMiddlewareChain(middlewares, input, ({ context }) =>
        call(context),
      ) as Output;
    },
  };
}

/**
 * Ce que l'appelant doit fournir : le schéma du contrat et ceux des middleware,
 * côté entrée. La façade client reste donc alignée sur ce que le registre valide.
 */
export type ServerFunctionInput<
  Definition extends ServerFunctionDefinition<any, any, any, any>,
> = Definition extends ServerFunctionDefinition<
  infer Contract,
  any,
  any,
  infer Middlewares
>
  ? MergeSchemaInputs<
      readonly [Contract['input'], ...MiddlewareSchemasOfAll<Middlewares>]
    >
  : never;

export type ServerFunctionOutput<
  Definition extends ServerFunctionDefinition<any, any, any, any>,
> = Definition extends ServerFunctionDefinition<any, any, infer Output, any>
  ? Output
  : never;

type AwaitedServerFunctionOutput<
  Definition extends ServerFunctionDefinition<any, any, any, any>,
> = Awaited<ServerFunctionOutput<Definition>>;

export type ServerFunctionSuccess<
  Definition extends ServerFunctionDefinition<any, any, any, any>,
> = AwaitedServerFunctionOutput<Definition> extends Effect.Effect<
  infer Success,
  infer _Error,
  infer _Requirements
>
  ? Success
  : AwaitedServerFunctionOutput<Definition>;

export type ServerFunctionError<
  Definition extends ServerFunctionDefinition<any, any, any, any>,
> = AwaitedServerFunctionOutput<Definition> extends Effect.Effect<
  infer _Success,
  infer Error,
  infer _Requirements
>
  ? Error
  : never;

export type ServerFunctionClientDIValues<
  Pipes extends readonly ServerFunctionPipe[],
> = ClientDIRequirementOf<Pipes[number]>;
