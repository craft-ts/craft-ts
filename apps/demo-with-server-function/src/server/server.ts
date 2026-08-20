import { createServer } from '@craft-ts/core';
import { executeEffect } from '@craft-ts/effect';
import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import { Effect, Exit, Layer, Scope } from 'effect';
import * as HttpServerRequest from 'effect/unstable/http/HttpServerRequest';
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse';
import { createServer as createHttpServer } from 'node:http';
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
import { createDemoDatabase } from './database';

export function createDemoApplication(
  authenticatedUser: AuthenticatedUser = demoAuthenticatedUser,
) {
  const database = createDemoDatabase();
  const runtimeLayer = Layer.mergeAll(
    database.layer,
    Layer.succeed(CurrentUser)(authenticatedUser),
  );
  const application = createServer({
    functions: [
      listPublicProducts,
      listUsers,
      getAuthenticatedUsers,
      portableListUsers,
      effectMiddlewareListUsers,
    ],
    execute: executeEffect(runtimeLayer).run,
  });
  return { application, close: database.close };
}

/**
 * Adapt the Web Response returned by the Craft server-function registry to
 * Node's request/response pair with Effect's official Node HTTP adapter.
 */
export function createDemoNodeHandler(
  authenticatedUser: AuthenticatedUser = demoAuthenticatedUser,
) {
  const demo = createDemoApplication(authenticatedUser);
  const scope = Effect.runSync(Scope.make('parallel'));
  const httpApp = Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const webRequest = yield* HttpServerRequest.toWeb(request);
    const webResponse = yield* Effect.tryPromise(() =>
      demo.application.handle(webRequest),
    );
    return HttpServerResponse.fromWeb(webResponse);
  });
  const handler = Effect.runSync(
    NodeHttpServer.makeHandler(httpApp, { scope }),
  );

  return {
    handler,
    close: () => {
      demo.close();
      Effect.runSync(Scope.close(scope, Exit.void));
    },
  };
}

export async function listenDemoServer(
  authenticatedUser: AuthenticatedUser = demoAuthenticatedUser,
): Promise<{
  readonly url: string;
  readonly close: () => Promise<void>;
}> {
  const demo = createDemoNodeHandler(authenticatedUser);
  const http = createHttpServer(demo.handler);
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
