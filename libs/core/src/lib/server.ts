import type { ServerFunctionContract } from './server-function-contract';
import type {
  ServerFunctionDefinition,
  ServerFunctionRuntime,
} from './server-function';

export type ServerFunctionServerOptions = {
  readonly runtime?: ServerFunctionRuntime;
  readonly execute?: (value: unknown) => unknown | Promise<unknown>;
};

export class ServerFunctionInputError extends Error {
  readonly code = 'CRAFT_SERVER_FUNCTION_INPUT_INVALID';
  readonly id: string;
  readonly issues: readonly { readonly message: string }[];

  constructor(
    id: string,
    issues: readonly { readonly message: string }[],
  ) {
    super(
      `CRAFT_SERVER_FUNCTION_INPUT_INVALID: Invalid input for server function "${id}": ${issues
        .map((issue) => issue.message)
        .join(', ')}`,
    );
    this.id = id;
    this.issues = issues;
    this.name = 'ServerFunctionInputError';
  }
}

export type Server = {
  readonly functions: readonly ServerFunctionDefinition<any, any, any>[];
  readonly invoke: (
    id: string,
    input: unknown,
  ) => Promise<unknown>;
  readonly handle: (request: Request) => Promise<Response>;
};

export function createServer(
  options: ServerFunctionServerOptions & {
    readonly functions: readonly ServerFunctionDefinition<any, any, any>[];
  },
): Server {
  const byId = new Map<string, ServerFunctionDefinition<any, any, any>>();
  for (const definition of options.functions) {
    if (byId.has(definition.contract.id)) {
      throw new Error(
        `Duplicate server function id "${definition.contract.id}" in server registry.`,
      );
    }
    byId.set(definition.contract.id, definition);
  }

  const invoke = async (id: string, input: unknown): Promise<unknown> => {
    const definition = byId.get(id);
    if (!definition) {
      throw new Error(`Server function "${id}" is not registered.`);
    }
    const result = await definition.invoke(
      await parseServerFunctionInput(definition.contract, input),
      options.runtime,
    );
    return options.execute ? options.execute(result) : result;
  };

  return {
    functions: options.functions,
    invoke,
    async handle(request) {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      const body = (await request.json()) as unknown;
    if (!isRecord(body) || typeof body['id'] !== 'string') {
        return new Response('Invalid server function request', { status: 400 });
      }
      try {
        const result = await invoke(
          body['id'] as string,
          body['input'],
        );
        return Response.json(result);
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : String(error) },
          { status: 500 },
        );
      }
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export type { ServerFunctionContract };

async function parseServerFunctionInput(
  contract: ServerFunctionContract,
  input: unknown,
): Promise<unknown> {
  const result = await contract.input['~standard'].validate(input);
  if (result.issues) {
    throw new ServerFunctionInputError(contract.id, result.issues);
  }
  return result.value;
}
