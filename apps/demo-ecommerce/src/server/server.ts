import { createServer } from '@craft-ts/core';
import { executeEffect } from '@craft-ts/effect';
import { createServer as createHttpServer } from 'node:http';
import { createStoreLayer } from './database';
import { getCatalog, login, logout, getAdminOverview, saveProduct, deleteProduct, saveCategory, deleteCategory, checkout, resetStore } from './functions';

export function createDemoApplication(path?: string) {
  const registry = createServer({
    functions: [getCatalog, login, logout, getAdminOverview, saveProduct, deleteProduct, saveCategory, deleteCategory, checkout, resetStore],
    execute: executeEffect(createStoreLayer(path)).run,
    runtimeOptions: { maxBodyBytes: 1_048_576, maxOutputBytes: 1_048_576, timeoutMs: 15_000 },
  });
  return registry;
}

// Les e2e donnent leur propre magasin, remis à zéro à chaque run : le fichier
// versionné `data/store.json` ne change pas et chaque run part du même état.
const storePath = process.env['CRAFT_DEMO_ECOMMERCE_STORE'] || undefined;

export async function handleDemoRequest(request: Request): Promise<Response> {
  return createDemoApplication(storePath).handle(request);
}

export function createDemoNodeServer() {
  const registry = createDemoApplication();
  return createHttpServer((request, response) => {
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    const method = request.method ?? 'GET';
    const hasBody = method !== 'GET' && method !== 'HEAD';
    const webRequest = new Request(`http://${request.headers.host ?? 'localhost'}${request.url ?? '/'}`, { method, headers, ...(hasBody ? { body: request as unknown as BodyInit, duplex: 'half' } : {}) } as RequestInit);
    void registry.handle(webRequest).then(async (webResponse) => {
      response.statusCode = webResponse.status;
      webResponse.headers.forEach((value, key) => response.setHeader(key, value));
      response.end(method === 'HEAD' || !webResponse.body ? undefined : Buffer.from(await webResponse.arrayBuffer()));
    }).catch((error: unknown) => {
      console.error(error);
      if (!response.headersSent) response.statusCode = 500;
      response.end('Internal Server Error');
    });
  });
}
