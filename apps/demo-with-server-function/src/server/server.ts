import { createServer } from '@craft-ts/core';
import { Effect } from 'effect';
import { createServer as createHttpServer, type IncomingMessage } from 'node:http';
import { getUsers } from '../users/list.fn-serveur';
import { createDemoDatabase, UserRepository } from './database';

export function createDemoApplication() {
  const database = createDemoDatabase();
  const application = createServer({
    functions: [getUsers],
    execute(value) {
      if (!Effect.isEffect(value)) return value;
      return Effect.runPromise(
        Effect.provide(
          value as Effect.Effect<unknown, unknown, UserRepository>,
          database.layer,
        ),
      );
    },
  });
  return { application, close: database.close };
}

export async function listenDemoServer(): Promise<{
  readonly url: string;
  readonly close: () => Promise<void>;
}> {
  const demo = createDemoApplication();
  const http = createHttpServer((request, response) => {
    void forwardRequest(request, response, demo.application.handle);
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

async function forwardRequest(
  request: IncomingMessage,
  response: import('node:http').ServerResponse,
  handle: (request: Request) => Promise<Response>,
): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks);
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') headers.set(name, value);
  }
  const webRequest = new Request(`http://${request.headers.host ?? 'localhost'}${request.url ?? '/'}`, {
    method: request.method,
    headers,
    body: body.length === 0 ? undefined : body,
  });
  const webResponse = await handle(webRequest);
  response.statusCode = webResponse.status;
  webResponse.headers.forEach((value, name) => response.setHeader(name, value));
  response.end(Buffer.from(await webResponse.arrayBuffer()));
}
