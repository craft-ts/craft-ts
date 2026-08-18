import {
  assertServerFunctionId,
  serverFunctionContract,
  type ServerFunctionContract,
  type ServerFunctionContractInput,
  type ServerFunctionExposure,
} from './server-function-contract';
import {
  type ClientDIRequirement,
  type ClientDIRequirementOf,
  type ClientDITokensOf,
  type ServerFunctionPipe,
  type ServerFunctionToken,
} from './client-di-requirement';
import type { CraftSchema } from './schema-validation';
import type * as Effect from 'effect/Effect';

export type ServerFunctionRequired<
  Pipes extends readonly ServerFunctionPipe[] = readonly ServerFunctionPipe[],
> = <Value>(token: ServerFunctionToken<Value> & ClientDITokensOf<Pipes>) => Value;

export type ServerFunctionHandlerContext<
  Contract extends ServerFunctionContract<any, any, any>,
  Pipes extends readonly ServerFunctionPipe[] = readonly ServerFunctionPipe[],
> = {
  readonly input: ServerFunctionContractInput<Contract>;
  readonly required: ServerFunctionRequired<Pipes>;
  readonly pipes: Pipes;
};

export type ServerFunctionHandler<
  Contract extends ServerFunctionContract<any, any, any>,
  Pipes extends readonly ServerFunctionPipe[] = readonly ServerFunctionPipe[],
  Output = unknown,
> = (context: ServerFunctionHandlerContext<Contract, Pipes>) => Output;

export type ServerFunctionDefinition<
  Contract extends ServerFunctionContract<any, any, any> = ServerFunctionContract,
  Pipes extends readonly ServerFunctionPipe[] = readonly ServerFunctionPipe[],
  Output = unknown,
> = {
  readonly kind: 'server-function';
  readonly contract: Contract;
  readonly pipes: Pipes;
  readonly handler: ServerFunctionHandler<Contract, Pipes, Output>;
  readonly invoke: (
    input: unknown,
    runtime?: ServerFunctionRuntime,
  ) => Output | Promise<Output>;
};

export type ServerFunctionRuntime = {
  readonly resolve?: <Value>(token: ServerFunctionToken<Value>) => Value;
};

type Builder<
  Contract extends ServerFunctionContract<any, any, any>,
  Pipes extends readonly ServerFunctionPipe[],
> = {
  readonly pipe: <Pipe extends ServerFunctionPipe>(
    pipe: Contract['exposure'] extends 'server'
      ? Pipe extends ClientDIRequirement
        ? never
        : Pipe
      : Pipe,
  ) => Builder<Contract, readonly [...Pipes, Pipe]>;
  readonly handler: <Output>(
    handler: ServerFunctionHandler<Contract, Pipes, Output>,
  ) => ServerFunctionDefinition<Contract, Pipes, Output>;
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

  return createBuilder(contract, [] as readonly []);
}

function createBuilder<
  Contract extends ServerFunctionContract<any, any, any>,
  Pipes extends readonly ServerFunctionPipe[],
>(
  contract: Contract,
  pipes: Pipes,
): Builder<Contract, Pipes> {
  return {
    pipe(pipe) {
      return createBuilder(
        contract,
        [...pipes, pipe] as readonly [...Pipes, ServerFunctionPipe],
      ) as unknown as Builder<Contract, readonly [...Pipes, typeof pipe]>;
    },
    handler(handler) {
      return createDefinition(contract, pipes, handler);
    },
  } as Builder<Contract, Pipes>;
}

function createDefinition<
  Contract extends ServerFunctionContract<any, any, any>,
  Pipes extends readonly ServerFunctionPipe[],
  Output,
>(
  contract: Contract,
  pipes: Pipes,
  handler: ServerFunctionHandler<Contract, Pipes, Output>,
): ServerFunctionDefinition<Contract, Pipes, Output> {
  return {
    kind: 'server-function',
    contract,
    pipes,
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
      return handler({
        input: input as ServerFunctionContractInput<Contract>,
        required,
        pipes,
      });
    },
  };
}

export type ServerFunctionInput<
  Definition extends ServerFunctionDefinition<any, any, any>,
> = ServerFunctionContractInput<Definition['contract']>;

export type ServerFunctionOutput<
  Definition extends ServerFunctionDefinition<any, any, any>,
> = Definition extends ServerFunctionDefinition<
  Definition['contract'],
  Definition['pipes'],
  infer Output
>
  ? Output
  : never;

type AwaitedServerFunctionOutput<
  Definition extends ServerFunctionDefinition<any, any, any>,
> = Awaited<ServerFunctionOutput<Definition>>;

export type ServerFunctionSuccess<
  Definition extends ServerFunctionDefinition<any, any, any>,
> = AwaitedServerFunctionOutput<Definition> extends Effect.Effect<
  infer Success,
  infer _Error,
  infer _Requirements
>
  ? Success
  : AwaitedServerFunctionOutput<Definition>;

export type ServerFunctionError<
  Definition extends ServerFunctionDefinition<any, any, any>,
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
