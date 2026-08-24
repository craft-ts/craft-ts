import {
  assertServerFunctionId,
  serverFunctionContract,
  type ServerFunctionContract,
  type ServerFunctionExposure,
} from './server-function-contract';
import type {
  ServerFunctionPipe,
  ServerFunctionToken,
} from './client-di-requirement';
import {
  collectMiddlewareClientContextSchemas,
  collectMiddlewareSchemas,
  runMiddlewareChain,
  type AnyCraftMiddleware,
  type MergedMiddlewareContext,
  type MergedMiddlewareError,
  type MergedMiddlewareRequirements,
  type MergeSchemaInputs,
  type MergeSchemaOutputs,
  type MiddlewareClientContextsOfAll,
  type MiddlewareSchemasOf,
  type MiddlewareSchemasOfAll,
} from './server-function-middleware';
import type {
  MergeOptionalSchemaInputs,
  MergeOptionalSchemaOutputs,
} from './middleware-schema-shared';
import type { AnyServerLayer } from './server-layer';
import type { CraftSchema } from './schema-validation';
import type * as Effect from 'effect/Effect';
import { provideCraftRequestContexts } from './craft-request-context';

/** Résout un token dans le DI **du serveur**, via le `runtime` du registre. */
export type ServerFunctionRequired = <Value>(
  token: ServerFunctionToken<Value>,
) => Value;

type ContractClientContextSchemas<
  Contract extends ServerFunctionContract<any, any, any>,
> =
  Contract extends ServerFunctionContract<
    any,
    any,
    any,
    any,
    infer ClientContextSchema
  >
    ? [ClientContextSchema] extends [CraftSchema]
      ? readonly [ClientContextSchema]
      : readonly []
    : readonly [];

/**
 * Le canal du contexte client, fusionné comme celui de l'input : le schéma
 * déclaré par la fonction, suivi de ceux exigés par ses middleware.
 */
export type ServerFunctionClientContextSchemas<
  Contract extends ServerFunctionContract<any, any, any>,
  Middlewares extends readonly AnyCraftMiddleware[],
> = readonly [
  ...ContractClientContextSchemas<Contract>,
  ...MiddlewareClientContextsOfAll<Middlewares>,
];

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
  /**
   * Contexte envoyé par le **navigateur**, validé par le schéma du contrat.
   *
   * Délibérément séparé de `context` : c'est une déclaration du client, pas une
   * donnée de confiance. Un middleware serveur doit la confronter à la vraie
   * session avant d'en faire quoi que ce soit.
   */
  readonly clientContext: MergeOptionalSchemaOutputs<
    ServerFunctionClientContextSchemas<Contract, Middlewares>
  >;
  readonly required: ServerFunctionRequired;
  readonly pipes: Pipes;
  /** Aborts when the HTTP client disconnects or the invocation times out. */
  readonly signal: AbortSignal;
  /** Stable correlation id; never contains request payload data. */
  readonly requestId?: string;
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
  Contract extends ServerFunctionContract<
    any,
    any,
    any
  > = ServerFunctionContract,
  Pipes extends readonly ServerFunctionPipe[] = readonly ServerFunctionPipe[],
  Output = unknown,
  Middlewares extends
    readonly AnyCraftMiddleware[] = readonly AnyCraftMiddleware[],
> = {
  readonly kind: 'server-function';
  /** Selects whether the registry must hand the result to an opaque adapter. */
  readonly programMode?: 'portable';
  readonly contract: Contract;
  readonly pipes: Pipes;
  readonly middlewares: Middlewares;
  /**
   * Couches composées par `.pipe(...)`, dans l'ordre déclaré. Séparées des
   * middleware : elles ne déclarent ni schéma ni contexte client, seulement une
   * composition de programme.
   */
  readonly layers?: readonly AnyServerLayer[];
  /** Schéma du contrat suivi de ceux des middleware, dédupliqués. */
  readonly inputSchemas: readonly CraftSchema[];
  /** Idem pour le contexte client attendu du navigateur. */
  readonly clientContextSchemas: readonly CraftSchema[];
  readonly handler: ServerFunctionHandler<Contract, Pipes, Output, Middlewares>;
  readonly invoke: (
    input: unknown,
    runtime?: ServerFunctionRuntime,
    clientContext?: Record<string, unknown>,
  ) => Output | Promise<Output>;
};

/** Vrai dès que la fonction attend un contexte du navigateur. */
export function requiresClientContext(
  definition: ServerFunctionDefinition<any, any, any, any>,
): boolean {
  return (definition.clientContextSchemas ?? []).length > 0;
}

export type ServerFunctionRuntime = {
  readonly resolve?: <Value>(token: ServerFunctionToken<Value>) => Value;
  readonly signal?: AbortSignal;
  readonly requestId?: string;
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
  : Output extends Effect.Effect<infer Success, infer Error, infer Requirements>
    ? Effect.Effect<
        Success,
        Error | MergedMiddlewareError<Middlewares>,
        Requirements | MergedMiddlewareRequirements<Middlewares>
      >
    : Output;

export type ServerFunctionBuilder<
  Contract extends ServerFunctionContract<any, any, any>,
  Pipes extends readonly ServerFunctionPipe[],
  Middlewares extends readonly AnyCraftMiddleware[] = readonly [],
  Schemas extends readonly CraftSchema[] = readonly [Contract['input']],
> = {
  readonly pipe: <Pipe extends ServerFunctionPipe>(
    pipe: Pipe,
  ) => ServerFunctionBuilder<
    Contract,
    readonly [...Pipes, Pipe],
    Middlewares,
    Schemas
  >;
  readonly use: <Middleware extends AnyCraftMiddleware>(
    middleware: Middleware,
  ) => ServerFunctionBuilder<
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

export function serverFunction<
  const Id extends string,
  Schema extends CraftSchema,
>(
  id: Id,
  input: Schema,
): ServerFunctionBuilder<
  ServerFunctionContract<Schema, 'server', undefined, Id>,
  readonly []
>;
export function serverFunction<
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
): ServerFunctionBuilder<
  ServerFunctionContract<
    Schema,
    Exposure,
    OutputSchema,
    Id,
    ClientContextSchema
  >,
  readonly []
>;
export function serverFunction<
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
): ServerFunctionBuilder<
  ServerFunctionContract<
    Schema,
    Exposure,
    OutputSchema,
    string,
    ClientContextSchema
  >,
  readonly []
>;
export function serverFunction<
  const Id extends string,
  Schema extends CraftSchema,
  Exposure extends ServerFunctionExposure,
  OutputSchema extends CraftSchema | undefined = undefined,
  ClientContextSchema extends CraftSchema | undefined = undefined,
>(
  contractOrId: Id | ServerFunctionContract<Schema, Exposure, OutputSchema>,
  input?: Schema,
  options?: {
    readonly exposure?: Exposure;
    readonly output?: OutputSchema;
    readonly clientContext?: ClientContextSchema;
  },
): ServerFunctionBuilder<
  ServerFunctionContract<
    Schema,
    Exposure,
    OutputSchema,
    Id,
    ClientContextSchema
  >,
  readonly []
> {
  const contract = (
    typeof contractOrId === 'string'
      ? serverFunctionContract({
          id: contractOrId,
          input: input as Schema,
          exposure: options?.exposure ?? 'server',
          output: options?.output,
          clientContext: options?.clientContext,
        })
      : contractOrId
  ) as ServerFunctionContract<
    Schema,
    Exposure,
    OutputSchema,
    Id,
    ClientContextSchema
  >;
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
): ServerFunctionBuilder<Contract, Pipes, Middlewares> {
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
    handler(
      handler: ServerFunctionHandler<Contract, Pipes, unknown, Middlewares>,
    ) {
      return createDefinition(contract, pipes, middlewares, handler) as never;
    },
  } as unknown as ServerFunctionBuilder<Contract, Pipes, Middlewares>;
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
  const clientContextSchemas = collectMiddlewareClientContextSchemas(
    contract.clientContext as CraftSchema | undefined,
    middlewares,
  );
  return {
    kind: 'server-function',
    contract,
    pipes,
    middlewares,
    inputSchemas: collectMiddlewareSchemas(contract.input, middlewares),
    clientContextSchemas,
    handler,
    invoke(input, runtime, clientContext) {
      const required: ServerFunctionRequired = (token) => {
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
          clientContext: (clientContext ?? {}) as never,
          required,
          pipes,
          signal: runtime?.signal ?? NEVER_ABORT_SIGNAL,
          ...(runtime?.requestId ? { requestId: runtime.requestId } : {}),
        });

      if (middlewares.length === 0) return call({});
      const program = runMiddlewareChain(
        middlewares,
        input,
        ({ context }) => call(context),
        clientContext ?? {},
        required,
      );
      return provideCraftRequestContexts(
        program,
        clientContextSchemas,
        (clientContext ?? {}) as Record<string, unknown>,
      ) as Output;
    },
  };
}

const NEVER_ABORT_SIGNAL = new AbortController().signal;

/**
 * Ce que l'appelant doit fournir : le schéma du contrat et ceux des middleware,
 * côté entrée. La façade client reste donc alignée sur ce que le registre valide.
 */
export type ServerFunctionInput<
  Definition extends ServerFunctionDefinition<any, any, any, any>,
> =
  Definition extends ServerFunctionDefinition<
    infer Contract,
    any,
    any,
    infer Middlewares
  >
    ? MergeSchemaInputs<
        readonly [Contract['input'], ...MiddlewareSchemasOfAll<Middlewares>]
      >
    : never;

/** Ce que le navigateur doit produire pour cette fonction. */
export type ServerFunctionExpectedClientContext<
  Definition extends ServerFunctionDefinition<any, any, any, any>,
> =
  Definition extends ServerFunctionDefinition<
    infer Contract,
    any,
    any,
    infer Middlewares
  >
    ? MergeOptionalSchemaInputs<
        ServerFunctionClientContextSchemas<Contract, Middlewares>
      >
    : Record<never, never>;

export type ServerFunctionOutput<
  Definition extends ServerFunctionDefinition<any, any, any, any>,
> =
  Definition extends ServerFunctionDefinition<any, any, infer Output, any>
    ? Output
    : never;

type AwaitedServerFunctionOutput<
  Definition extends ServerFunctionDefinition<any, any, any, any>,
> = Awaited<ServerFunctionOutput<Definition>>;

export type ServerFunctionSuccess<
  Definition extends ServerFunctionDefinition<any, any, any, any>,
> =
  AwaitedServerFunctionOutput<Definition> extends Effect.Effect<
    infer Success,
    infer _Error,
    infer _Requirements
  >
    ? Success
    : AwaitedServerFunctionOutput<Definition>;

export type ServerFunctionError<
  Definition extends ServerFunctionDefinition<any, any, any, any>,
> =
  AwaitedServerFunctionOutput<Definition> extends Effect.Effect<
    infer _Success,
    infer Error,
    infer _Requirements
  >
    ? Error
    : never;

/**
 * `serverFunction` pré-équipé d'une chaîne de middleware serveur par défaut.
 *
 * Sucre volontairement léger : la factory ne fait qu'appliquer `.use(...)` dans
 * l'ordre donné avant de rendre la main au builder habituel. Les middleware par
 * défaut sont donc soumis aux mêmes règles que les autres — aplatissement,
 * déduplication par id, fusion des schémas — et une fonction peut toujours en
 * ajouter les siens par-dessus.
 */
export type ServerFunctionFactory<
  Defaults extends readonly AnyCraftMiddleware[],
> = {
  <const Id extends string, Schema extends CraftSchema>(
    id: Id,
    input: Schema,
  ): ServerFunctionBuilder<
    ServerFunctionContract<Schema, 'server', undefined, Id>,
    readonly [],
    Defaults,
    readonly [Schema, ...MiddlewareSchemasOfAll<Defaults>]
  >;
  <
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
  ): ServerFunctionBuilder<
    ServerFunctionContract<
      Schema,
      Exposure,
      OutputSchema,
      Id,
      ClientContextSchema
    >,
    readonly [],
    Defaults,
    readonly [Schema, ...MiddlewareSchemasOfAll<Defaults>]
  >;
};

export function createServerFunctionFactory<
  const Defaults extends readonly AnyCraftMiddleware[],
>(defaultServerMiddlewares: Defaults): ServerFunctionFactory<Defaults> {
  return ((
    id: string,
    input: CraftSchema,
    options?: {
      readonly exposure?: ServerFunctionExposure;
      readonly output?: CraftSchema;
      readonly clientContext?: CraftSchema;
    },
  ) => {
    let builder = serverFunction(id, input, {
      exposure: options?.exposure ?? 'server',
      ...(options?.output === undefined ? {} : { output: options.output }),
      ...(options?.clientContext === undefined
        ? {}
        : { clientContext: options.clientContext }),
    }) as unknown as {
      use: (middleware: AnyCraftMiddleware) => typeof builder;
    };
    for (const middleware of defaultServerMiddlewares) {
      builder = builder.use(middleware);
    }
    return builder;
  }) as unknown as ServerFunctionFactory<Defaults>;
}
