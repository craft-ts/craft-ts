import {
  createCsrfMiddleware,
  createHttpServer as createHttpApplication,
  createSecurityMiddleware,
  createServer,
  type Server,
} from '@craft-ts/core';
import { executeEffect } from '@craft-ts/effect';
import { Layer } from 'effect';
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import {
  demoAuthenticatedUser,
  CurrentUser,
  type AuthenticatedUser,
} from './authentication';
import { getAuthenticatedUsers } from '../users/authenticated-list.fn-serveur';
import { listUsers } from '../users/list.fn-serveur';
import { portableListUsers } from '../users/portable-list.fn-serveur';
import { effectMiddlewareListUsers } from '../users/effect-middleware-list.fn-serveur';
import { listPublicProducts } from '../products/public-products.fn-serveur';
import { createDemoDatabase, UserRepository } from './database';

export function createDemoApplication(
  authenticatedUser: AuthenticatedUser = demoAuthenticatedUser,
) {
  const database = createDemoDatabase();
  const runtimeLayer = Layer.mergeAll(
    database.layer,
    Layer.succeed(CurrentUser)(authenticatedUser),
  );
  return {
    application: createApplication(runtimeLayer),
    close: database.close,
  };
}

/**
 * Builds the server-function registry from a request-scoped runtime layer.
 *
 * Keeping this separate from the demo database makes the same registry usable
 * by the HTTP adapter and by SSR's in-memory transport. The layer must be
 * created for each request when it contains request data such as CurrentUser.
 */
export function createApplication(
  runtimeLayer: Layer.Layer<CurrentUser | UserRepository, unknown, never>,
): Server {
  return createServer({
    functions: [
      listPublicProducts,
      listUsers,
      getAuthenticatedUsers,
      portableListUsers,
      effectMiddlewareListUsers,
    ],
    execute: executeEffect(runtimeLayer).run,
    runtimeOptions: {
      maxBodyBytes: 1_048_576,
      maxOutputBytes: 1_048_576,
      timeoutMs: 15_000,
    },
    // Catalogue public : un tag absent de cette table repart en erreur
    // interne générique, donc une exception ne peut pas emporter ses
    // propriétés jusqu'au navigateur.
    publicErrors: {
      UsersNotFound: { code: 'USERS_NOT_FOUND', status: 404 },
      AuthenticatedUsersNotFound: {
        code: 'AUTHENTICATED_USERS_NOT_FOUND',
        status: 404,
      },
      DemoMiddlewareFailure: {
        code: 'DEMO_MIDDLEWARE_FAILURE',
        status: 422,
      },
      DemoHandlerFailure: {
        code: 'DEMO_HANDLER_FAILURE',
        status: 422,
      },
      // Ces deux échecs portent leurs données à plat : seules les propriétés
      // nommées ici sortent, le message interne reste côté serveur.
      AuthenticatedUserMismatch: {
        code: 'AUTHENTICATED_USER_MISMATCH',
        status: 403,
        fields: ['requestedUserId', 'authenticatedUserId'],
      },
      AdminRequired: {
        code: 'ADMIN_REQUIRED',
        status: 403,
        fields: ['role'],
      },
    },
  });
}

/**
 * Keeps the server-function registry on the Web Request/Response boundary.
 * Platform adapters only translate the request at the edge.
 */
/**
 * Hôtes servis par la démo. Vide en local : l'URL d'écoute est éphémère.
 * En déploiement, la liste ferme la porte à un `Host` forgé.
 */
const trustedHosts = (process.env.TRUSTED_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

export function createDemoWebHandler(
  authenticatedUser: AuthenticatedUser = demoAuthenticatedUser,
) {
  const demo = createDemoApplication(authenticatedUser);
  const application = createHttpApplication({
    middleware: [createCsrfMiddleware(), createSecurityMiddleware()],
    maxBodyBytes: 1_048_576,
    timeoutMs: 15_000,
    ...(trustedHosts.length > 0 ? { trustedHosts } : {}),
    handler: (request) => demo.application.handle(request),
  });

  return {
    application,
    close: demo.close,
  };
}

export async function handleDemoNodeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  authenticatedUser: AuthenticatedUser = demoAuthenticatedUser,
): Promise<void> {
  const demo = createDemoWebHandler(authenticatedUser);
  try {
    const webResponse = await demo.application.handle(toWebRequest(request));
    await writeWebResponse(webResponse, response, request.method === 'HEAD');
  } finally {
    demo.close();
  }
}

export async function listenDemoServer(
  authenticatedUser: AuthenticatedUser = demoAuthenticatedUser,
): Promise<{
  readonly url: string;
  readonly close: () => Promise<void>;
}> {
  const demo = createDemoWebHandler(authenticatedUser);
  const http = createHttpServer((request, response) => {
    void demo.application
      .handle(toWebRequest(request))
      .then((webResponse) =>
        writeWebResponse(webResponse, response, request.method === 'HEAD'),
      )
      .catch((error: unknown) => {
        if (!response.headersSent) response.statusCode = 500;
        response.end('Internal Server Error');
        console.error(error);
      });
  });
  await new Promise<void>((resolve) => {
    http.listen(0, '127.0.0.1', resolve);
  });
  const address = http.address();
  if (!address || typeof address === 'string') {
    demo.close();
    http.close();
    throw new Error('Demo server did not expose a TCP address.');
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      demo.close();
      await new Promise<void>((resolve, reject) => {
        http.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function toWebRequest(request: IncomingMessage): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value !== undefined) {
      headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    }
  }
  const method = request.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  return new Request(
    `http://${request.headers.host ?? 'localhost'}${request.url ?? '/'}`,
    {
      method,
      headers,
      ...(hasBody
        ? {
            body: request as unknown as BodyInit,
            duplex: 'half',
          }
        : {}),
    } as RequestInit,
  );
}

async function writeWebResponse(
  webResponse: Response,
  response: ServerResponse,
  head: boolean,
): Promise<void> {
  response.statusCode = webResponse.status;
  for (const [name, value] of webResponse.headers) {
    response.setHeader(name, value);
  }
  if (head || webResponse.body === null) {
    response.end();
    return;
  }
  response.end(Buffer.from(await webResponse.arrayBuffer()));
}
