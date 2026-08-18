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

export type ServerFunctionRequired<
  Pipes extends readonly ServerFunctionPipe[] = readonly ServerFunctionPipe[],
> = <Value>(token: ServerFunctionToken<Value> & ClientDITokensOf<Pipes>) => Value;

export type ServerFunctionHandlerContext<
  Contract extends ServerFunctionContract,
  Pipes extends readonly ServerFunctionPipe[] = readonly ServerFunctionPipe[],
> = {
  readonly input: ServerFunctionContractInput<Contract>;
  readonly required: ServerFunctionRequired<Pipes>;
  readonly pipes: Pipes;
};

export type ServerFunctionHandler<
  Contract extends ServerFunctionContract,
  Pipes extends readonly ServerFunctionPipe[] = readonly ServerFunctionPipe[],
  Output = unknown,
> = (context: ServerFunctionHandlerContext<Contract, Pipes>) => Output;

export type ServerFunctionDefinition<
  Contract extends ServerFunctionContract = ServerFunctionContract,
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
  Contract extends ServerFunctionContract,
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

export function serverFunction<Schema extends CraftSchema>(
  id: string,
  input: Schema,
): Builder<ServerFunctionContract<Schema, 'server'>, readonly []>;
export function serverFunction<
  Schema extends CraftSchema,
  Exposure extends ServerFunctionExposure,
>(
  contract: ServerFunctionContract<Schema, Exposure>,
): Builder<ServerFunctionContract<Schema, Exposure>, readonly []>;
export function serverFunction<
  Schema extends CraftSchema,
  Exposure extends ServerFunctionExposure,
>(
  contractOrId: string | ServerFunctionContract<Schema, Exposure>,
  input?: Schema,
): Builder<ServerFunctionContract<Schema, Exposure>, readonly []> {
  const contract =
    typeof contractOrId === 'string'
      ? (serverFunctionContract({
          id: contractOrId,
          input: input as Schema,
          exposure: 'server',
        }) as ServerFunctionContract<Schema, Exposure>)
      : contractOrId;
  assertServerFunctionId(contract.id);

  return createBuilder(contract, [] as readonly []);
}

function createBuilder<
  Contract extends ServerFunctionContract,
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
  Contract extends ServerFunctionContract,
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

export type ServerFunctionClientDIValues<
  Pipes extends readonly ServerFunctionPipe[],
> = ClientDIRequirementOf<Pipes[number]>;
