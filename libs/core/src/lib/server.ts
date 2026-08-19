import type { ServerFunctionContract } from './server-function-contract';
import {
  clientDIRequirementsOf,
  requiresClientContext,
  type ServerFunctionDefinition,
  type ServerFunctionRuntime,
} from './server-function';
import type { CraftSchema } from './schema-validation';
import { craftHandshakeName } from './craft-handshake';

export type ServerFunctionServerOptions = {
  readonly runtime?: ServerFunctionRuntime;
  readonly execute?: (value: unknown) => unknown | Promise<unknown>;
  /**
   * Évalue une permission déclarée par `requireServerPermission(...)`.
   *
   * Le registre échoue en fermeture : une server function qui déclare une
   * permission sans que ce contrôle soit configuré est rejetée, plutôt que
   * d'exposer silencieusement une déclaration qui ne vérifie rien.
   */
  readonly checkPermission?: (
    permission: string,
    context: { readonly id: string },
  ) => boolean | Promise<boolean>;
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

/**
 * Contexte client refusé. Distinct de `ServerFunctionInputError` à dessein :
 * dans les journaux, une donnée métier invalide et un contexte navigateur
 * invalide ne racontent pas la même histoire.
 */
export class ServerFunctionClientContextError extends Error {
  readonly code = 'CRAFT_SERVER_FUNCTION_CLIENT_CONTEXT_INVALID';
  readonly id: string;
  readonly issues: readonly { readonly message: string }[];

  constructor(id: string, issues: readonly { readonly message: string }[]) {
    super(
      `CRAFT_SERVER_FUNCTION_CLIENT_CONTEXT_INVALID: Invalid client context for server function "${id}": ${issues
        .map((issue) => issue.message)
        .join(', ')}`,
    );
    this.id = id;
    this.issues = issues;
    this.name = 'ServerFunctionClientContextError';
  }
}

export class ServerFunctionProtocolError extends Error {
  readonly code = 'CRAFT_SERVER_FUNCTION_PROTOCOL_UNSUPPORTED';

  constructor(version: unknown) {
    super(
      `CRAFT_SERVER_FUNCTION_PROTOCOL_UNSUPPORTED: unsupported server function protocol version ${JSON.stringify(version)}. This registry speaks version 1 (and the version-less legacy format).`,
    );
    this.name = 'ServerFunctionProtocolError';
  }
}

export class ServerFunctionPermissionError extends Error {
  readonly code = 'CRAFT_SERVER_FUNCTION_PERMISSION_DENIED';
  readonly id: string;
  readonly permission: string;

  constructor(id: string, permission: string, reason: string) {
    super(
      `CRAFT_SERVER_FUNCTION_PERMISSION_DENIED: Server function "${id}" requires permission "${permission}": ${reason}`,
    );
    this.id = id;
    this.permission = permission;
    this.name = 'ServerFunctionPermissionError';
  }
}

export class ServerFunctionOutputError extends Error {
  readonly code = 'CRAFT_SERVER_FUNCTION_OUTPUT_INVALID';
  readonly id: string;
  readonly issues: readonly { readonly message: string }[];

  constructor(
    id: string,
    issues: readonly { readonly message: string }[],
  ) {
    super(
      `CRAFT_SERVER_FUNCTION_OUTPUT_INVALID: Invalid output for server function "${id}": ${issues
        .map((issue) => issue.message)
        .join(', ')}`,
    );
    this.id = id;
    this.issues = issues;
    this.name = 'ServerFunctionOutputError';
  }
}

export type Server = {
  readonly functions: readonly ServerFunctionDefinition<any, any, any>[];
  readonly invoke: (
    id: string,
    input: unknown,
    /** Contexte brut envoyé par le navigateur, validé avant tout usage. */
    clientContext?: unknown,
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

  const invoke = async (
    id: string,
    input: unknown,
    clientContext?: unknown,
  ): Promise<unknown> => {
    const definition = byId.get(id);
    if (!definition) {
      throw new Error(`Server function "${id}" is not registered.`);
    }
    await checkServerFunctionPermissions(definition, options.checkPermission);
    const result = await definition.invoke(
      await parseServerFunctionInput(definition, input),
      options.runtime,
      await parseServerFunctionClientContext(definition, clientContext),
    );
    const executed = options.execute ? await options.execute(result) : result;
    return parseServerFunctionOutput(definition.contract, executed);
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
        assertSupportedProtocol(body['protocolVersion']);
        const result = await invoke(
          body['id'] as string,
          body['input'],
          body['context'],
        );
        return Response.json(result);
      } catch (error) {
        if (error instanceof ServerFunctionPermissionError) {
          return Response.json(
            { error: { message: error.message } },
            { status: 403 },
          );
        }
        if (
          error instanceof ServerFunctionInputError ||
          error instanceof ServerFunctionClientContextError
        ) {
          return Response.json(
            { error: { message: error.message, issues: error.issues } },
            { status: 400 },
          );
        }
        if (error instanceof ServerFunctionProtocolError) {
          return Response.json(
            { error: { message: error.message } },
            { status: 400 },
          );
        }
        const failure = toServerFunctionFailure(error);
        if (failure) return Response.json({ error: failure }, { status: 422 });
        return Response.json(
          {
            error: {
              message: error instanceof Error ? error.message : String(error),
            },
          },
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

async function checkServerFunctionPermissions(
  definition: ServerFunctionDefinition<any, any, any, any>,
  checkPermission: ServerFunctionServerOptions['checkPermission'],
): Promise<void> {
  const id = definition.contract.id as string;
  for (const pipe of definition.pipes as readonly {
    kind?: string;
    permission?: string;
  }[]) {
    if (pipe.kind !== 'server-permission' || !pipe.permission) continue;
    if (!checkPermission) {
      throw new ServerFunctionPermissionError(
        id,
        pipe.permission,
        'no permission checker is configured on the server registry.',
      );
    }
    if (!(await checkPermission(pipe.permission, { id }))) {
      throw new ServerFunctionPermissionError(id, pipe.permission, 'denied.');
    }
  }
}

/**
 * Standard Schema ne sait pas fusionner deux schémas : on valide donc l'input
 * brut avec chacun d'eux, puis on fusionne les sorties. Un schéma de middleware
 * doit par conséquent ignorer les clés en trop, ce qui est le comportement par
 * défaut d'un `Schema.Struct`.
 */
async function parseServerFunctionInput(
  definition: ServerFunctionDefinition<any, any, any, any>,
  input: unknown,
): Promise<unknown> {
  const contract = definition.contract as ServerFunctionContract;
  const schemas: readonly CraftSchema[] = definition.inputSchemas ?? [
    contract.input,
  ];
  if (schemas.length === 1) {
    return validateInputSchema(contract.id, schemas[0], input);
  }

  const merged: Record<string, unknown> = {};
  for (const schema of schemas) {
    const value = await validateInputSchema(contract.id, schema, input);
    if (!isRecord(value)) {
      throw new Error(
        `CRAFT_SERVER_FUNCTION_INPUT_NOT_MERGEABLE: Server function "${contract.id}" combines several input schemas, so each one must produce an object.`,
      );
    }
    Object.assign(merged, value);
  }
  return merged;
}

async function validateInputSchema(
  id: string,
  schema: CraftSchema,
  input: unknown,
): Promise<unknown> {
  const result = await schema['~standard'].validate(input);
  if (result.issues) {
    throw new ServerFunctionInputError(id, result.issues);
  }
  return result.value;
}

function assertSupportedProtocol(version: unknown): void {
  if (version === undefined || version === 1) return;
  throw new ServerFunctionProtocolError(version);
}

/**
 * Valide le contexte envoyé par le navigateur.
 *
 * Deux canaux, tous deux issus du client et tous deux traités comme non
 * fiables : le schéma `clientContext` du contrat (ce que la chaîne de
 * middleware client publie), et les valeurs de chaque `requireClientDI(...)`.
 * Rien n'est fusionné dans le contexte de confiance produit par les middleware
 * serveur : le résultat vit dans son propre champ, `clientContext`.
 */
async function parseServerFunctionClientContext(
  definition: ServerFunctionDefinition<any, any, any, any>,
  raw: unknown,
): Promise<Record<string, unknown> | undefined> {
  if (!requiresClientContext(definition)) return undefined;
  const id = definition.contract.id as string;
  if (raw === undefined || raw === null) {
    throw new ServerFunctionClientContextError(id, [
      {
        message:
          'the function declares a client context but the request carried none.',
      },
    ]);
  }
  if (!isRecord(raw)) {
    throw new ServerFunctionClientContextError(id, [
      { message: 'the client context must be an object.' },
    ]);
  }

  const validated: Record<string, unknown> = {};
  for (const schema of definition.clientContextSchemas ?? []) {
    const result = await schema['~standard'].validate(raw);
    if (result.issues) {
      // Nommer le handshake fautif quand il y en a un : dans un journal, savoir
      // *quel* accord n'a pas été tenu vaut mieux que la seule liste des clés.
      const handshake = craftHandshakeName(schema);
      throw new ServerFunctionClientContextError(
        id,
        handshake === undefined
          ? result.issues
          : result.issues.map((issue) => ({
              message: `handshake "${handshake}": ${issue.message}`,
            })),
      );
    }
    if (!isRecord(result.value)) {
      throw new ServerFunctionClientContextError(id, [
        { message: 'a client context schema must produce an object.' },
      ]);
    }
    Object.assign(validated, result.value);
  }

  for (const requirement of clientDIRequirementsOf(definition)) {
    if (!(requirement.key in raw)) {
      throw new ServerFunctionClientContextError(id, [
        {
          message: `missing client-provided value "${requirement.key}".`,
        },
      ]);
    }
    // Une clé déjà validée par un schéma du contrat ou d'un middleware n'est
    // pas un conflit : le pipe n'est alors qu'un accesseur typé sur la même
    // valeur, et c'est la version validée qui gagne.
    if (Object.prototype.hasOwnProperty.call(validated, requirement.key)) {
      continue;
    }
    validated[requirement.key] = requirement.schema
      ? await validateClientValue(id, requirement.key, requirement.schema, raw[requirement.key])
      : raw[requirement.key];
  }
  return validated;
}

async function validateClientValue(
  id: string,
  key: string,
  schema: CraftSchema,
  value: unknown,
): Promise<unknown> {
  const result = await schema['~standard'].validate(value);
  if (result.issues) {
    throw new ServerFunctionClientContextError(
      id,
      result.issues.map((issue) => ({
        message: `client-provided value "${key}": ${issue.message}`,
      })),
    );
  }
  return result.value;
}

export type ServerFunctionFailure = {
  readonly _tag: string;
  readonly [key: string]: unknown;
};

/**
 * Sérialise un échec métier tagué (`Data.TaggedError` et assimilés) en objet
 * transportable. Effect rejette avec l'erreur elle-même, il n'y a donc pas de
 * `Cause` à déballer ici, et le core reste sans dépendance runtime sur Effect.
 */
export function toServerFunctionFailure(
  error: unknown,
): ServerFunctionFailure | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const tag = (error as { _tag?: unknown })._tag;
  if (typeof tag !== 'string') return undefined;

  const failure: Record<string, unknown> = { _tag: tag };
  for (const key of Object.getOwnPropertyNames(error)) {
    if (key === 'stack' || key === '_tag') continue;
    failure[key] = (error as Record<string, unknown>)[key];
  }
  return failure as ServerFunctionFailure;
}

async function parseServerFunctionOutput(
  contract: ServerFunctionContract,
  output: unknown,
): Promise<unknown> {
  if (!contract.output) return output;
  const result = await contract.output['~standard'].validate(output);
  if (result.issues) {
    throw new ServerFunctionOutputError(contract.id, result.issues);
  }
  return result.value;
}
