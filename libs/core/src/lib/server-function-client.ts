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
import {
  abstract,
  craftService,
  type AbstractServiceApi,
  type CraftServiceProvider,
} from './craft-service';
import { craftUse } from './craft-use';
import {
  craftException,
  type CraftExceptionResult,
} from './craft-exception';
import type { CraftUnique } from './craft-unique';

export type ServerFunctionRequest = {
  readonly id: string;
  readonly input: unknown;
};

export type ServerFunctionTransport = (
  request: ServerFunctionRequest,
) => unknown | Promise<unknown>;

const serverFunctionTransportService = craftService(
  { name: 'ServerFunctionTransport', providedIn: 'abstract' },
  abstract<ServerFunctionTransport>(),
) as AbstractServiceApi<'ServerFunctionTransport', ServerFunctionTransport>;

export const ServerFunctionTransport: () => Generator<
  unknown,
  ServerFunctionTransport,
  unknown
> =
  serverFunctionTransportService.ServerFunctionTransport;

export function provideServerFunctionTransport(
  transport: ServerFunctionTransport,
): CraftServiceProvider {
  return serverFunctionTransportService.provideServerFunctionTransport(
    () => transport,
  );
}

export function provideDefaultServerFunctionTransport() {
  return provideServerFunctionTransport(defaultServerFunctionTransport);
}

export type ServerFunctionHttpError = CraftExceptionResult<
  {
    _tag: 'HttpError';
    scope: 'ServerFunctionClient';
    identifier: string;
  },
  {
    readonly id: string;
    readonly status: number;
    readonly statusText: string;
    readonly body: unknown;
  }
>;

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

type ServerFunctionId<
  Definition extends ServerFunctionDefinition<any, any, any>,
> = Definition['contract']['id'];

export function createServerFunctionClient<
  Definition extends ServerFunctionDefinition<any, any, any>,
>(
  id: CraftUnique<ServerFunctionId<Definition>>,
): ServerFunctionClient<Definition>;

export function createServerFunctionClient<
  Contract extends ServerFunctionContract<any, any, any>,
>(
  contract: Contract,
): ServerFunctionContractClient<Contract>;
export function createServerFunctionClient<
  Definition extends ServerFunctionDefinition<any, any, any>,
  ClientOutput = ServerFunctionSuccess<Definition>,
>(
  contract: ServerFunctionDefinitionContract<Definition>,
): ServerFunctionClient<Definition, ClientOutput> {
  return (async (input: ServerFunctionContractInput<typeof contract>) => {
    const transport = craftUse(ServerFunctionTransport());
    return transport({
      id: typeof contract === 'string' ? contract : contract.id,
      input,
    });
  }) as ServerFunctionClient<
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
    return craftException(
      {
        _tag: 'HttpError',
        scope: 'ServerFunctionClient',
        identifier: request.id,
      },
      {
        id: request.id,
        status: 0,
        statusText: 'FetchUnavailable',
        body: `No server function transport configured for "${request.id}".`,
      },
    );
  }
  const response = await fetch('/__server-functions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    return craftException(
      {
        _tag: 'HttpError',
        scope: 'ServerFunctionClient',
        identifier: request.id,
      },
      {
        id: request.id,
        status: response.status,
        statusText: response.statusText,
        body,
      },
    );
  }
  return body;
}
