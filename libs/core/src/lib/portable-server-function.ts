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
  runMiddlewareChain,
  type AnyCraftMiddleware,
  type MiddlewareSchemasOf,
  type PortableServerMiddleware,
} from './server-function-middleware';
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
> = ServerFunctionHandlerContext<Contract, Pipes, Middlewares, Schemas>;

export type PortableServerFunctionHandler<
  Contract extends ServerFunctionContract<any, any, any>,
  Pipes extends readonly ServerFunctionPipe[] = readonly ServerFunctionPipe[],
  Output = unknown,
  Middlewares extends readonly AnyCraftMiddleware[] = readonly [],
  Schemas extends readonly CraftSchema[] = readonly [Contract['input']],
> = (
  context: PortableServerFunctionHandlerContext<
    Contract,
    Pipes,
    Middlewares,
    Schemas
  >,
) => Output;

export type PortableServerFunctionBuilder<
  Contract extends ServerFunctionContract<any, any, any>,
  Pipes extends readonly ServerFunctionPipe[],
  Middlewares extends readonly AnyCraftMiddleware[] = readonly [],
  Schemas extends readonly CraftSchema[] = readonly [Contract['input']],
> = {
  readonly pipe: <Pipe extends ServerFunctionPipe>(
    pipe: Pipe,
  ) => PortableServerFunctionBuilder<
    Contract,
    readonly [...Pipes, Pipe],
    Middlewares,
    Schemas
  >;
  readonly use: <
    Middleware extends PortableServerMiddleware<any, any, any, any, any, any>,
  >(
    middleware: Middleware,
  ) => PortableServerFunctionBuilder<
    Contract,
    Pipes,
    readonly [...Middlewares, Middleware],
    readonly [...Schemas, ...MiddlewareSchemasOf<Middleware>]
  >;
  readonly handler: <Output>(
    handler: PortableServerFunctionHandler<
      Contract,
      Pipes,
      Output,
      Middlewares,
      Schemas
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
  ) as never;
}

function createPortableBuilder<
  Contract extends ServerFunctionContract<any, any, any>,
  Pipes extends readonly ServerFunctionPipe[],
  Middlewares extends readonly AnyCraftMiddleware[],
>(
  contract: Contract,
  pipes: Pipes,
  middlewares: Middlewares,
): PortableServerFunctionBuilder<Contract, Pipes, Middlewares> {
  return {
    pipe(pipe) {
      return createPortableBuilder(
        contract,
        [...pipes, pipe] as readonly [...Pipes, ServerFunctionPipe],
        middlewares,
      ) as never;
    },
    use(middleware) {
      return createPortableBuilder(contract, pipes, [
        ...middlewares,
        middleware,
      ] as readonly [...Middlewares, typeof middleware]) as never;
    },
    handler(handler) {
      return createPortableDefinition(
        contract,
        pipes,
        middlewares,
        handler,
      ) as never;
    },
  } as PortableServerFunctionBuilder<Contract, Pipes, Middlewares>;
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
  handler: PortableServerFunctionHandler<Contract, Pipes, Output, Middlewares>,
): ServerFunctionDefinition<Contract, Pipes, Output, Middlewares> {
  return {
    kind: 'server-function',
    programMode: 'portable',
    contract,
    pipes,
    middlewares,
    inputSchemas: collectMiddlewareSchemas(contract.input, middlewares),
    clientContextSchemas: collectMiddlewareClientContextSchemas(
      contract.clientContext as CraftSchema | undefined,
      middlewares,
    ),
    handler,
    invoke(input, runtime, clientContext) {
      const resolve: ServerFunctionRequired = (token) => {
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
          required: resolve,
          pipes,
        });

      if (middlewares.length === 0) return call({});
      return runMiddlewareChain(
        middlewares,
        input,
        ({ context }) => call(context),
        clientContext ?? {},
        resolve,
      ) as Output;
    },
  };
}
