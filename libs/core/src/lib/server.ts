import type { ServerFunctionContract } from './server-function-contract';
import {
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
  readonly runtimeOptions?: ServerFunctionRuntimeOptions;
  /**
   * Catalogue des échecs métier exposables. Dès qu'il est fourni, un tag
   * absent du catalogue est traité comme une erreur interne : c'est ce qui
   * empêche une exception de voyager avec toutes ses propriétés.
   */
  readonly publicErrors?: Readonly<Record<string, PublicServerFunctionError>>;
  readonly security?: ServerFunctionSecurityOptions;
};

/**
 * Le protocole HTTP des server functions est monté sur des cookies de session
 * dans la quasi-totalité des applications : il doit donc refuser les requêtes
 * déclenchées par un autre site.
 */
export type ServerFunctionSecurityOptions = Readonly<{
  /** Origines autorisées en plus de celle de la requête. */
  readonly allowedOrigins?: readonly string[];
  /**
   * `'strict'` (défaut) refuse toute requête dont l'origine est étrangère et
   * tout corps qui n'est pas déclaré `application/json`. `'off'` ne doit
   * servir qu'à un endpoint sans cookie ni en-tête d'autorisation implicite.
   */
  readonly mode?: 'strict' | 'off';
}>;

/**
 * Description d'un échec exposable.
 *
 * Le tag et le payload de `craftException` restent dans la réponse — ils sont
 * écrits par le développeur, et le client les retype en exception — mais les
 * autres propriétés de l'erreur (message d'origine, `cause`, champs internes)
 * ne sortent pas du serveur sans être nommées dans `fields`.
 */
export type PublicServerFunctionError = Readonly<{
  readonly code: string;
  readonly status?: number;
  readonly message?: string;
  /** Propriétés supplémentaires autorisées à voyager. */
  readonly fields?: readonly string[];
}>;

export type ServerFunctionRequestContext = Readonly<{
  readonly id: string;
  readonly requestId?: string;
  readonly signal: AbortSignal;
}>;

export type ServerFunctionRuntimeOptions = Readonly<{
  readonly maxBodyBytes?: number;
  readonly maxOutputBytes?: number;
  readonly timeoutMs?: number;
  readonly requestId?: string;
  readonly signal?: AbortSignal;
  readonly onInvoke?: (context: ServerFunctionRequestContext) => void;
}>;

export class ServerFunctionInputError extends Error {
  readonly code = 'CRAFT_SERVER_FUNCTION_INPUT_INVALID';
  readonly id: string;
  readonly issues: readonly { readonly message: string }[];

  constructor(id: string, issues: readonly { readonly message: string }[]) {
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

  constructor(id: string, issues: readonly { readonly message: string }[]) {
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

export class ServerFunctionNotFoundError extends Error {
  readonly code = 'CRAFT_SERVER_FUNCTION_NOT_FOUND';

  constructor(id: string) {
    super('The requested server function does not exist.');
    this.name = 'ServerFunctionNotFoundError';
  }
}

export type Server = {
  readonly functions: readonly ServerFunctionDefinition<any, any, any>[];
  readonly invoke: (
    id: string,
    input: unknown,
    /** Contexte brut envoyé par le navigateur, validé avant tout usage. */
    clientContext?: unknown,
    runtimeOptions?: ServerFunctionRuntimeOptions,
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
    runtimeOptions: ServerFunctionRuntimeOptions = options.runtimeOptions ?? {},
  ): Promise<unknown> => {
    const definition = byId.get(id);
    if (!definition) {
      throw new ServerFunctionNotFoundError(id);
    }
    const invocation = createInvocationSignal(runtimeOptions);
    const context: ServerFunctionRequestContext = Object.freeze({
      id,
      ...(runtimeOptions.requestId ? { requestId: runtimeOptions.requestId } : {}),
      signal: invocation.signal,
    });
    runtimeOptions.onInvoke?.(context);
    try {
      const work = (async () => {
        await checkServerFunctionPermissions(definition, options.checkPermission);
        const invoked = definition.invoke(
          await parseServerFunctionInput(definition, input),
          {
            ...options.runtime,
            signal: invocation.signal,
            ...(runtimeOptions.requestId
              ? { requestId: runtimeOptions.requestId }
              : {}),
          },
          await parseServerFunctionClientContext(definition, clientContext),
        );
        // Portable definitions keep their opaque program intact until the
        // adapter sees it. Legacy definitions await the handler here.
        const program =
          definition.programMode === 'portable' ? invoked : await invoked;
        const executed = options.execute
          ? await options.execute(program)
          : await program;
        return await parseServerFunctionOutput(definition.contract, executed);
      })();
      return await raceWithAbort(work, invocation.signal);
    } finally {
      invocation.dispose();
    }
  };

  return {
    functions: options.functions,
    invoke,
    async handle(request) {
      if (request.method !== 'POST') {
        return secureJson(
          { error: { code: 'CRAFT_SERVER_FUNCTION_METHOD_NOT_ALLOWED' } },
          405,
          { allow: 'POST' },
        );
      }
      const rejection = checkServerFunctionRequestOrigin(
        request,
        options.security,
      );
      if (rejection) return rejection;
      let body: unknown;
      try {
        const maxBodyBytes = options.runtimeOptions?.maxBodyBytes ?? 1_000_000;
        const contentLength = request.headers.get('content-length');
        if (contentLength && Number(contentLength) > maxBodyBytes) {
          return secureJson(
            { error: { code: 'CRAFT_SERVER_FUNCTION_BODY_TOO_LARGE' } },
            413,
          );
        }
        const bodyText = await readLimitedBody(request, maxBodyBytes);
        if (bodyText === BODY_TOO_LARGE) {
          return secureJson(
            { error: { code: 'CRAFT_SERVER_FUNCTION_BODY_TOO_LARGE' } },
            413,
          );
        }
        body = JSON.parse(bodyText) as unknown;
      } catch {
        return secureJson(
          {
            error: {
              code: 'CRAFT_SERVER_FUNCTION_REQUEST_INVALID',
              message: 'Invalid JSON request body.',
            },
          },
          400,
        );
      }
      if (!isRecord(body) || typeof body['id'] !== 'string') {
        return secureJson(
          { error: { code: 'CRAFT_SERVER_FUNCTION_REQUEST_INVALID' } },
          400,
        );
      }
      try {
        assertSupportedProtocol(body['protocolVersion']);
        const requestId = safeRequestId(request.headers.get('x-request-id'));
        const result = await invoke(
          body['id'] as string,
          body['input'],
          body['context'],
          {
            ...options.runtimeOptions,
            ...(requestId ? { requestId } : {}),
            signal: request.signal,
          },
        );
        const output = JSON.stringify(result);
        if (
          output !== undefined &&
          byteLength(output) > (options.runtimeOptions?.maxOutputBytes ?? 1_000_000)
        ) {
          return secureJson(
            { error: { code: 'CRAFT_SERVER_FUNCTION_OUTPUT_TOO_LARGE' } },
            413,
          );
        }
        return new Response(output ?? 'null', {
          status: 200,
          headers: { ...SECURE_RESPONSE_HEADERS },
        });
      } catch (error) {
        if (error instanceof ServerFunctionNotFoundError) {
          // Une fonction inconnue et un identifiant invalide renvoient la
          // même chose : sinon le catalogue de fonctions s'énumère.
          return secureJson(
            { error: { code: 'CRAFT_SERVER_FUNCTION_REQUEST_INVALID' } },
            400,
          );
        }
        if (error instanceof ServerFunctionPermissionError) {
          return secureJson({ error: { message: error.message } }, 403);
        }
        if (
          error instanceof ServerFunctionInputError ||
          error instanceof ServerFunctionClientContextError
        ) {
          return secureJson(
            { error: { message: error.message, issues: error.issues } },
            400,
          );
        }
        if (error instanceof ServerFunctionProtocolError) {
          return secureJson({ error: { message: error.message } }, 400);
        }
        const failure = toServerFunctionFailure(error);
        if (failure) {
          const mapping = options.publicErrors?.[failure._tag];
          if (mapping) {
            const exposed: Record<string, unknown> = {
              _tag: failure._tag,
              code: mapping.code,
              message: mapping.message ?? 'The request could not be completed.',
            };
            // Forme canonique d'une exception Craft : le payload déclaré et
            // son alias nommé d'après le tag.
            for (const field of ['payload', failure._tag]) {
              if (field in failure) {
                exposed[field] = (failure as Record<string, unknown>)[field];
              }
            }
            for (const field of mapping.fields ?? []) {
              if (field in failure) {
                exposed[field] = (failure as Record<string, unknown>)[field];
              }
            }
            return secureJson({ error: exposed }, mapping.status ?? 422);
          }
          // Sans catalogue, on conserve la compatibilité historique : l'échec
          // tagué est le protocole public de l'application. Dès qu'un
          // catalogue existe, un tag absent est une fuite potentielle et
          // repart en erreur interne.
          if (!options.publicErrors) {
            return secureJson(
              { error: failure },
              serverFunctionFailureStatus(failure),
            );
          }
        }
        return secureJson(
          {
            error: {
              code: 'CRAFT_SERVER_FUNCTION_INTERNAL',
              message: 'The server function failed.',
            },
          },
          500,
        );
      }
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Les réponses du protocole ne doivent jamais être mises en cache ni reniflées :
 * elles transportent des données de session.
 */
const SECURE_RESPONSE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'content-type': 'application/json',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  vary: 'Origin',
});

function secureJson(
  body: unknown,
  status: number,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURE_RESPONSE_HEADERS, ...headers },
  });
}

const BODY_TOO_LARGE = Symbol('craft-body-too-large');

/**
 * Lit le corps en le comptant au fil de l'eau. `request.text()` chargerait
 * l'intégralité d'un corps chunké — sans `Content-Length` à contrôler — avant
 * de pouvoir le refuser.
 */
async function readLimitedBody(
  request: Request,
  maxBodyBytes: number,
): Promise<string | typeof BODY_TOO_LARGE> {
  const body = request.body;
  if (!body || typeof body.getReader !== 'function') {
    const text = await request.text();
    return byteLength(text) > maxBodyBytes ? BODY_TOO_LARGE : text;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBodyBytes) return BODY_TOO_LARGE;
      chunks.push(decoder.decode(value, { stream: true }));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  chunks.push(decoder.decode());
  return chunks.join('');
}

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/** Un identifiant de corrélation vient du client : il est validé, pas cru. */
function safeRequestId(candidate: string | null): string | undefined {
  return candidate && REQUEST_ID.test(candidate) ? candidate : undefined;
}

/**
 * Refuse les requêtes déclenchées par un autre site. Le transport CraftTS
 * envoie `application/json`, ce qui impose déjà un préflight CORS ; exiger ce
 * type ferme la porte aux « simple requests » d'un formulaire tiers, et la
 * comparaison d'origine ferme celle des appels `fetch` avec identifiants.
 */
function checkServerFunctionRequestOrigin(
  request: Request,
  security: ServerFunctionSecurityOptions | undefined,
): Response | undefined {
  if (security?.mode === 'off') return undefined;
  const contentType = request.headers.get('content-type') ?? '';
  if (!/^application\/(?:[\w.+-]+\+)?json\s*(?:;|$)/i.test(contentType)) {
    return secureJson(
      {
        error: {
          code: 'CRAFT_SERVER_FUNCTION_CONTENT_TYPE_UNSUPPORTED',
          message: 'Server functions only accept application/json requests.',
        },
      },
      415,
    );
  }
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') {
    return forbiddenOrigin();
  }
  const origin = request.headers.get('origin');
  if (!origin) return undefined;
  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    return forbiddenOrigin();
  }
  if (
    origin === requestOrigin ||
    (security?.allowedOrigins ?? []).includes(origin)
  ) {
    return undefined;
  }
  return forbiddenOrigin();
}

function forbiddenOrigin(): Response {
  return secureJson(
    {
      error: {
        code: 'CRAFT_SERVER_FUNCTION_ORIGIN_REJECTED',
        message: 'The request origin is not allowed.',
      },
    },
    403,
  );
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function createInvocationSignal(options: ServerFunctionRuntimeOptions): {
  readonly signal: AbortSignal;
  readonly dispose: () => void;
} {
  const controller = new AbortController();
  const abortParent = () => controller.abort(options.signal?.reason);
  if (options.signal) {
    if (options.signal.aborted) abortParent();
    else options.signal.addEventListener('abort', abortParent, { once: true });
  }
  const timer = setTimeout(
    () => controller.abort(new DOMException('Invocation timed out', 'TimeoutError')),
    options.timeoutMs ?? 10_000,
  );
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abortParent);
    },
  };
}

async function raceWithAbort<T>(
  work: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
  let abort: () => void = () => undefined;
  const cancelled = new Promise<never>((_, reject) => {
    abort = () =>
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([work, cancelled]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
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

  return validated;
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

function serverFunctionFailureStatus(failure: ServerFunctionFailure): number {
  const status =
    failure['status'] ??
    (isRecord(failure['payload']) ? failure['payload']['status'] : undefined);
  return typeof status === 'number' &&
    Number.isInteger(status) &&
    status >= 400 &&
    status <= 599
    ? status
    : 422;
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
