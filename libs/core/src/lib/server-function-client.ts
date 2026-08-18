import type {
  ServerFunctionContract,
  ServerFunctionContractInput,
  ServerFunctionContractOutput,
} from './server-function-contract';
import type {
  ServerFunctionDefinition,
  ServerFunctionInput,
  ServerFunctionError,
  ServerFunctionSuccess,
} from './server-function';

export type ServerFunctionRequest = {
  readonly id: string;
  readonly input: unknown;
};

export type ServerFunctionTransport = (
  request: ServerFunctionRequest,
) => unknown | Promise<unknown>;

export type ServerFunctionContractClient<
  Contract extends ServerFunctionContract<any, any, any>,
> = (
  input: ServerFunctionContractInput<Contract>,
) => Promise<ServerFunctionContractOutput<Contract>>;

export type ServerFunctionClient<
  Definition extends ServerFunctionDefinition<any, any, any>,
  ClientOutput = ServerFunctionSuccess<Definition>,
> = (
  input: ServerFunctionInput<Definition>,
) => Promise<ClientOutput>;

export type ServerFunctionClientError<
  Definition extends ServerFunctionDefinition<any, any, any>,
> = ServerFunctionError<Definition>;

export function createServerFunctionClient<
  Definition extends ServerFunctionDefinition<any, any, any>,
>(
  id: string,
  transport?: ServerFunctionTransport,
): ServerFunctionClient<Definition>;

export function createServerFunctionClient<
  Contract extends ServerFunctionContract<any, any, any>,
>(
  contract: Contract,
  transport?: ServerFunctionTransport,
): ServerFunctionContractClient<Contract>;
export function createServerFunctionClient<
  Definition extends ServerFunctionDefinition<any, any, any>,
  ClientOutput = ServerFunctionSuccess<Definition>,
>(
  contract: ServerFunctionDefinitionContract<Definition>,
  transport: ServerFunctionTransport = defaultServerFunctionTransport,
): ServerFunctionClient<Definition, ClientOutput> {
  return (async (input: ServerFunctionContractInput<typeof contract>) =>
    transport({
      id: typeof contract === 'string' ? contract : contract.id,
      input,
    })) as ServerFunctionClient<
    Definition,
    ClientOutput
  >;
}

type ServerFunctionDefinitionContract<
  Definition extends ServerFunctionDefinition,
> = Definition['contract'];

async function defaultServerFunctionTransport(
  request: ServerFunctionRequest,
): Promise<unknown> {
  if (typeof fetch !== 'function') {
    throw new Error(
      `No server function transport configured for "${request.id}".`,
    );
  }
  const response = await fetch('/__server-functions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(
      `Server function "${request.id}" failed with HTTP ${response.status}.`,
    );
  }
  return response.json();
}
