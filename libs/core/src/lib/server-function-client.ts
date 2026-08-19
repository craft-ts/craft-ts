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
import {
  craftException,
  type CraftExceptionResult,
} from './craft-exception';

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

/**
 * Échec métier rejoué côté client. Chaque erreur taguée du canal d'erreur
 * serveur devient une `CraftException` du même tag, avec la charge utile
 * d'origine.
 */
export type ServerFunctionClientFailure<
  Definition extends ServerFunctionDefinition<any, any, any, any>,
> = ServerFunctionError<Definition> extends infer Failure
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
  ClientOutput =
    | ServerFunctionSuccess<Definition>
    | ServerFunctionClientFailure<Definition>
    | ServerFunctionHttpError,
> = (
  input: ServerFunctionInput<Definition>,
) => Promise<ClientOutput>;

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
  Attachments extends readonly ServerFunctionClientAttachment[] = readonly ServerFunctionClientAttachment[],
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
>(
  contract: Contract,
): ServerFunctionContractClient<Contract>;
export function createServerFunctionClient<
  Definition extends ServerFunctionDefinition<any, any, any>,
  ClientOutput = ServerFunctionSuccess<Definition>,
>(
  contract: ServerFunctionDefinitionContract<Definition>,
):
  | ServerFunctionClient<Definition, ClientOutput>
  | ServerFunctionClientBuilder<Definition> {
  const id = (typeof contract === 'string' ? contract : contract.id) as string;
  const makeClient = (
    attachments: readonly ServerFunctionClientAttachment[],
  ): ServerFunctionClient<Definition, ClientOutput> => {
    const middlewares = attachments.filter(isCraftClientMiddleware);
    const providedSchemas = collectClientMiddlewareSchemas(middlewares);

    return (async (input: ServerFunctionContractInput<typeof contract>) => {
      // Tout ce qui dépend du contexte d'injection **ambiant** est fait avant
      // le premier `await` : il n'existe que le temps de l'appel synchrone. La
      // chaîne, elle, reçoit l'injecteur capturé et le rétablit elle-même après
      // chaque suspension.
      const transport = craftUse(ServerFunctionTransport());
      if (middlewares.length === 0) return transport({ id, input });

      const injector = captureInjector();
      const context = await runClientMiddlewareChainAsync(
        middlewares,
        input,
        injector,
      );

      await validateClientContext(id, providedSchemas, context);
      return transport({ id, input, context, protocolVersion: 1 });
    }) as ServerFunctionClient<Definition, ClientOutput>;
  };

  const client = makeClient([]);
  Object.defineProperty(client, 'pipe', {
    value: (attachment: ServerFunctionClientContextAttachments<any>) =>
      makeClient(attachment.attachments),
  });
  return client;
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
