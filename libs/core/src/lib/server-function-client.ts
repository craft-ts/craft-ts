import type {
  ServerFunctionContract,
  ServerFunctionContractInput,
} from './server-function-contract';
import type {
  ServerFunctionDefinition,
  ServerFunctionInput,
  ServerFunctionOutput,
} from './server-function';

export type ServerFunctionRequest = {
  readonly id: string;
  readonly input: unknown;
};

export type ServerFunctionTransport = (
  request: ServerFunctionRequest,
) => unknown | Promise<unknown>;

export type ServerFunctionClient<
  Definition extends ServerFunctionDefinition<any, any, any>,
> = (
  input: ServerFunctionInput<Definition>,
) => Promise<Awaited<ServerFunctionOutput<Definition>>>;

export function createServerFunctionClient<
  Definition extends ServerFunctionDefinition<any, any, any>,
>(
  contract: ServerFunctionDefinitionContract<Definition>,
  transport: ServerFunctionTransport = defaultServerFunctionTransport,
): ServerFunctionClient<Definition> {
  return (async (input: ServerFunctionContractInput<typeof contract>) =>
    transport({ id: contract.id, input })) as ServerFunctionClient<Definition>;
}

type ServerFunctionDefinitionContract<
  Definition extends ServerFunctionDefinition<any, any, any>,
> = ServerFunctionContract<
  Definition['contract']['input'],
  Definition['contract']['exposure']
>;

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
