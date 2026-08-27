import type {
  ServerFunctionContract,
  ServerFunctionContractInput,
  ServerFunctionContractOutput,
} from './server-function-contract';
import type {
  ServerFunctionDefinition,
  ServerFunctionExpectedClientContext,
  ServerFunctionInput,
  ServerFunctionError,
  ServerFunctionSuccess,
} from './server-function';
import type { CraftGenExceptionMarker } from './craft-gen';
import type { AnyCraftException } from './craft-exception';
import {
  collectClientMiddlewareSchemas,
  isCraftClientMiddleware,
  runClientMiddlewareChainAsync,
  validateClientContext,
  type AnyCraftClientMiddleware,
  type ClientMiddlewareContextOf,
} from './client-function-middleware';
import type { UnionToIntersection } from './middleware-schema-shared';

import { inject, Injector } from './host/craft-compat';
import {
  abstract,
  craftService,
  type AbstractServiceApi,
  type CraftServiceProvider,
} from './craft-service';
import { craftUse } from './craft-use';
import { craftException, type CraftExceptionResult } from './craft-exception';
import {
  CRAFT_PROMISE_AWAIT_REQUEST_MARKER,
  type RuntimePromiseAwaitRequest,
} from './craft-generator-runtime';

export type ServerFunctionRequest = {
  readonly id: string;
  readonly input: unknown;
  /**
   * Contexte produit par la chaîne client (middleware `.client(...)` et pipes
   * `requireClientDI(...)`). Absent quand la fonction n'en attend aucun : le
   * format historique `{ id, input }` reste donc valide et inchangé.
   */
  readonly context?: unknown;
  /** Absent = format historique. `1` = requête porteuse d'un contexte client. */
  readonly protocolVersion?: 1;
};

export type ServerFunctionTransport = (
  request: ServerFunctionRequest,
) => unknown | Promise<unknown>;

export type ServerFunctionEndpoint =
  | string
  | URL
  | ((serverFunctionId: string) => string | URL);

export type ServerFunctionFetchTransportOptions = Readonly<{
  endpoint: ServerFunctionEndpoint;
  fetch?: typeof globalThis.fetch;
  headers?: Readonly<Record<string, string>>;
}>;

const serverFunctionTransportService = craftService(
  { name: 'ServerFunctionTransport', providedIn: 'abstract' },
  abstract<ServerFunctionTransport>(),
) as AbstractServiceApi<'ServerFunctionTransport', ServerFunctionTransport>;

export const ServerFunctionTransport: () => Generator<
  unknown,
  ServerFunctionTransport,
  unknown
> = serverFunctionTransportService.ServerFunctionTransport;

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

/**
 * Creates a transport for an embedded endpoint, Worker route or Lambda
 * Function URL. The protocol and typed server-function contract stay the
 * same; only the endpoint resolution changes.
 */
export function createServerFunctionFetchTransport(
  options: ServerFunctionFetchTransportOptions,
): ServerFunctionTransport {
  return (request) => {
    try {
      const endpoint =
        typeof options.endpoint === 'function'
          ? options.endpoint(request.id)
          : options.endpoint;
      return fetchServerFunctionRequest(request, endpoint, options);
    } catch (error) {
      return toServerFunctionHttpError(request, error);
    }
  };
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
) => ServerFunctionInvocation<
  ServerFunctionContractOutput<Contract>,
  ServerFunctionHttpError
>;

/**
 * A server call is deliberately a Craft generator rather than a Promise.
 * Resource loaders are the asynchronous boundary that drives this invocation;
 * callers outside an async Craft host cannot accidentally fire-and-forget it.
 */
export type ServerFunctionInvocation<
  Result = unknown,
  Error extends AnyCraftException = never,
> = Generator<
  [Error] extends [never] ? unknown : CraftGenExceptionMarker<Error>,
  Result,
  unknown
>;

/**
 * Échec métier rejoué côté client. Chaque erreur taguée du canal d'erreur
 * serveur devient une `CraftException` du même tag, avec la charge utile
 * d'origine.
 */
export type ServerFunctionClientFailure<
  Definition extends ServerFunctionDefinition<any, any, any, any>,
> =
  ServerFunctionError<Definition> extends infer Failure
    ? Failure extends { readonly _tag: string }
      ? CraftExceptionResult<
          {
            _tag: Failure['_tag'];
            scope: 'ServerFunction';
            identifier: Definition['contract']['id'];
          },
          Failure
        >
      : never
    : never;

export type ServerFunctionClient<
  Definition extends ServerFunctionDefinition<any, any, any, any>,
  ClientOutput = ServerFunctionSuccess<Definition>,
> = (
  input: ServerFunctionInput<Definition>,
) => ServerFunctionInvocation<
  ClientOutput,
  ServerFunctionClientFailure<Definition> | ServerFunctionHttpError
>;

export type ServerFunctionClientError<
  Definition extends ServerFunctionDefinition<any, any, any>,
> = ServerFunctionError<Definition>;

type ServerFunctionId<
  Definition extends ServerFunctionDefinition<any, any, any>,
> = Definition['contract']['id'];

/**
 * Ce qu'on accroche à une façade client pour alimenter le canal `context` :
 * un middleware client composé, ou le rappel d'un `requireClientDI(...)`
 * déclaré côté serveur.
 */
export type ServerFunctionClientAttachment = AnyCraftClientMiddleware;

declare const CLIENT_CONTEXT_ATTACHMENTS: unique symbol;

/**
 * Ce que `craftClientMiddleware(...)` produit : la liste des attaches,
 * plus deux porteurs type-only qui décrivent ce que la chaîne publiera.
 *
 * La composition est terminée par le `.pipe(...)` du builder retourné par
 * `createServerFunctionClient(...)`. Son type de définition est souvent fourni
 * explicitement (`<typeof serverFn>`), tandis que les paramètres de
 * `craftClientMiddleware(...)` restent inférés au site où les middleware sont
 * attachés.
 */
export interface ServerFunctionClientContextAttachments<
  Context,
  Attachments extends
    readonly ServerFunctionClientAttachment[] = readonly ServerFunctionClientAttachment[],
> {
  readonly [CLIENT_CONTEXT_ATTACHMENTS]: true;
  readonly attachments: Attachments;
  /** Porteur covariant : ce que la chaîne publie doit couvrir l'attendu. */
  readonly __clientContext: Context;
}

/**
 * Contexte que les middleware client attachés produisent, toutes clés
 * confondues. L'intersection remplace le fold ordonné : au site d'attache
 * l'ordre ne change pas ce qui doit être couvert, seulement qui gagne en cas
 * de doublon — et un doublon est déjà refusé au runtime.
 */
type AttachedClientContext<
  Attachments extends readonly ServerFunctionClientAttachment[],
> = [Attachments[number]] extends [never]
  ? Record<never, never>
  : UnionToIntersection<
      Attachments[number] extends infer Middleware
        ? Middleware extends AnyCraftClientMiddleware
          ? ClientMiddlewareContextOf<Middleware>
          : never
        : never
    >;

/** Déclare ce que le navigateur enverra à une server function. */
export function craftClientMiddleware<
  const Attachments extends readonly ServerFunctionClientAttachment[],
>(
  ...attachments: Attachments
): ServerFunctionClientContextAttachments<
  AttachedClientContext<Attachments>,
  Attachments
> {
  return Object.freeze({
    attachments,
  }) as unknown as ServerFunctionClientContextAttachments<
    AttachedClientContext<Attachments>,
    Attachments
  >;
}

type ExpectedClientContext<
  Definition extends ServerFunctionDefinition<any, any, any>,
> = ServerFunctionExpectedClientContext<Definition>;

/** Vrai dès que la définition attend un contexte du navigateur. */
type NeedsClientContext<
  Definition extends ServerFunctionDefinition<any, any, any>,
> = [keyof ExpectedClientContext<Definition>] extends [never] ? false : true;

/** Builder retourné avant d'attacher le contexte client requis. */
export type ServerFunctionClientBuilder<
  Definition extends ServerFunctionDefinition<any, any, any>,
> = {
  readonly pipe: (
    clientContext: ServerFunctionClientContextAttachments<
      ExpectedClientContext<Definition>
    >,
  ) => ServerFunctionClient<Definition>;
};

export function createServerFunctionClient<
  Definition extends ServerFunctionDefinition<any, any, any>,
>(
  /**
   * L'identité de la fonction. `craftHandshake('…')` déclaré dans un module
   * partagé est la forme recommandée : les deux côtés passent alors la **même**
   * valeur, donc TypeScript vérifie lui-même l'égalité des ids. `craftUnique('…')`
   * reste accepté pour les familles qui répètent la chaîne des deux côtés.
   */
  id: ServerFunctionId<Definition>,
): NeedsClientContext<Definition> extends true
  ? ServerFunctionClientBuilder<Definition>
  : ServerFunctionClient<Definition>;

export function createServerFunctionClient<
  Contract extends ServerFunctionContract<any, any, any>,
>(contract: Contract): ServerFunctionContractClient<Contract>;
export function createServerFunctionClient<
  Definition extends ServerFunctionDefinition<any, any, any>,
  ClientOutput = ServerFunctionSuccess<Definition>,
>(
  contract: ServerFunctionDefinitionContract<Definition>,
):
  | ServerFunctionClient<Definition, ClientOutput>
  | ServerFunctionClientBuilder<Definition>
  | ServerFunctionContractClient<ServerFunctionContract<any, any, any>> {
  const id = (typeof contract === 'string' ? contract : contract.id) as string;
  const makeClient = (
    attachments: readonly ServerFunctionClientAttachment[],
  ): ServerFunctionClient<Definition, ClientOutput> => {
    return ((input: ServerFunctionContractInput<typeof contract>) =>
      invokeServerFunction(id, input, attachments)) as ServerFunctionClient<
      Definition,
      ClientOutput
    >;
  };

  const client = makeClient([]);
  Object.defineProperty(client, 'pipe', {
    value: (attachment: ServerFunctionClientContextAttachments<any>) =>
      makeClient(attachment.attachments),
  });
  return client;
}

function* invokeServerFunction(
  id: string,
  input: unknown,
  attachments: readonly ServerFunctionClientAttachment[],
): ServerFunctionInvocation<unknown> {
  const transport = craftUse(ServerFunctionTransport());
  const middlewares = attachments.filter(isCraftClientMiddleware);

  if (middlewares.length === 0) {
    return yield* awaitServerFunctionResult(
      invokeServerFunctionTransport(transport, { id, input }),
    );
  }

  // The injector must be captured while the invocation is being driven by its
  // resource loader. The middleware chain restores it across every suspension.
  const injector = captureInjector();
  const providedSchemas = collectClientMiddlewareSchemas(middlewares);
  const context = yield* awaitServerFunctionResult(
    runClientMiddlewareChainAsync(middlewares, input, injector),
  );

  yield* awaitServerFunctionResult(
    validateClientContext(id, providedSchemas, context),
  );
  return yield* awaitServerFunctionResult(
    invokeServerFunctionTransport(transport, {
      id,
      input,
      context,
      protocolVersion: 1,
    }),
  );
}

function invokeServerFunctionTransport(
  transport: ServerFunctionTransport,
  request: ServerFunctionRequest,
): Promise<unknown> {
  try {
    return Promise.resolve(transport(request)).catch((error) =>
      toServerFunctionHttpError(request, error),
    );
  } catch (error) {
    return Promise.resolve(toServerFunctionHttpError(request, error));
  }
}

function* awaitServerFunctionResult<Result>(
  value: Result | PromiseLike<Result>,
): Generator<RuntimePromiseAwaitRequest, Result, unknown> {
  return (yield {
    [CRAFT_PROMISE_AWAIT_REQUEST_MARKER]: true,
    value: Promise.resolve(value),
  }) as Result;
}

function captureInjector(): Injector {
  try {
    return inject(Injector);
  } catch {
    return Injector.create({ providers: [] });
  }
}

type ServerFunctionDefinitionContract<
  Definition extends ServerFunctionDefinition,
> = Definition['contract'];

async function defaultServerFunctionTransport(
  request: ServerFunctionRequest,
): Promise<unknown> {
  return fetchServerFunctionRequest(request, '/__server-functions');
}

async function fetchServerFunctionRequest(
  request: ServerFunctionRequest,
  endpoint: string | URL,
  options: Pick<ServerFunctionFetchTransportOptions, 'fetch' | 'headers'> = {},
): Promise<unknown> {
  const fetcher = options.fetch ?? globalThis.fetch;
  if (typeof fetcher !== 'function') {
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
  try {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // En-tête non « simple » : il force un préflight CORS, donc un site
        // tiers ne peut pas rejouer l'appel avec les cookies de l'utilisateur.
        'x-craft-protocol': '1',
        ...options.headers,
      },
      body: JSON.stringify(request),
    });

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      return toServerFunctionHttpError(request, error, {
        status: response.status,
        statusText: response.statusText,
      });
    }

    if (!response.ok) {
      const failure = readServerFunctionFailure(body);
      if (failure) {
        return craftException(
          {
            _tag: failure._tag,
            scope: 'ServerFunction',
            identifier: request.id,
          },
          failure,
        );
      }
      return toServerFunctionHttpError(request, body, {
        status: response.status,
        statusText: response.statusText,
      });
    }
    return body;
  } catch (error) {
    return toServerFunctionHttpError(request, error);
  }
}

function toServerFunctionHttpError(
  request: ServerFunctionRequest,
  body: unknown,
  response: Pick<
    ServerFunctionHttpError['payload'],
    'status' | 'statusText'
  > = {
    status: 0,
    statusText: 'Unknown Error',
  },
): ServerFunctionHttpError {
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
  ) as ServerFunctionHttpError;
}

/** Relit un échec métier tagué sérialisé par le registre serveur. */
export function readServerFunctionFailure(
  body: unknown,
): ({ readonly _tag: string } & Record<string, unknown>) | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return undefined;
  const tag = (error as { _tag?: unknown })._tag;
  if (typeof tag !== 'string') return undefined;
  return error as { readonly _tag: string } & Record<string, unknown>;
}
