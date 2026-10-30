/// <reference types="vite/client" />
import { defineConfig, type ViteDevServer } from 'vite';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { craftTextLoaderPlugin } from '../../tools/vite-text-loader-plugin.mjs';
import { craftProductionBuildOptions } from '../../tools/vite-production-options.mjs';
import { craftStyle } from '../../libs/style/src/plugin/vite.ts';
import { ECOMMERCE_CATALOG_VERSION, encodeEcommerceScenario, findEcommerceOperations, findEcommerceScenarios } from './src/shared/scenario-catalog.ts';

const root = path.dirname(fileURLToPath(import.meta.url));
function serverFunctionsPlugin() {
  return {
    name: 'ecommerce-server-functions',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__craft/scenarios', (request, response) => {
        if (request.method !== 'GET') {
          response.statusCode = 405;
          response.end();
          return;
        }
        const url = new URL(request.url ?? '/', 'http://localhost');
        response.setHeader('content-type', 'application/json; charset=utf-8');
        response.setHeader('cache-control', 'no-store');
        try {
          const operationId = url.searchParams.get('operationId');
          const scenarioId = url.searchParams.get('scenarioId');
          const result = operationId && scenarioId
            ? encodeEcommerceScenario(operationId, scenarioId)
            : {
                catalogVersion: ECOMMERCE_CATALOG_VERSION,
                operations: findEcommerceOperations({
                  route: url.searchParams.get('route') ?? undefined,
                  operationId: operationId ?? undefined,
                  text: url.searchParams.get('q') ?? undefined,
                }),
                scenarios: findEcommerceScenarios({
                  route: url.searchParams.get('route') ?? undefined,
                  operationId: operationId ?? undefined,
                  text: url.searchParams.get('q') ?? undefined,
                }),
              };
          response.statusCode = 200;
          response.end(JSON.stringify(result));
        } catch (error) {
          response.statusCode = 404;
          response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      });
      server.middlewares.use('/__server-functions', (request, response) => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(request.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        const method = request.method ?? 'GET';
        const hasBody = method !== 'GET' && method !== 'HEAD';
        const webRequest = new Request(`http://${request.headers.host ?? 'localhost'}${request.url ?? '/'}`, { method, headers, ...(hasBody ? { body: request as unknown as BodyInit, duplex: 'half' } : {}) } as RequestInit);
        // Chargé à chaque requête : Vite garde le module en cache et ne le
        // recharge qu'après une modification du code serveur.
        void server.ssrLoadModule('/src/server/server.ts').then(({ handleDemoRequest }) => handleDemoRequest(webRequest)).then(async (result) => { response.statusCode = result.status; result.headers.forEach((value, key) => response.setHeader(key, value)); response.end(Buffer.from(await result.arrayBuffer())); }).catch((error: unknown) => { if (!response.headersSent) response.statusCode = 500; response.end('Internal Server Error'); console.error(error); });
      });
    },
  };
}

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/apps/demo-ecommerce',
  publicDir: false,
  plugins: [craftTextLoaderPlugin(), serverFunctionsPlugin(), craftStyle({ include: [path.resolve(root, '../../libs/component/src')], alias: { '@craft-ts/style': path.resolve(root, '../../libs/style/src/index.ts'), '@craft-ts/core': path.resolve(root, '../../libs/core/src/index.ts'), '@craft-ts/component': path.resolve(root, '../../libs/component/src/index.ts') } })],
  server: { port: Number(process.env['CRAFT_DEMO_ECOMMERCE_PORT'] ?? 4204), forwardConsole: true, fs: { allow: [path.resolve(root, '../..')] } },
  resolve: { tsconfigPaths: true, mainFields: ['module', 'browser', 'jsnext:main', 'jsnext'] },
  build: craftProductionBuildOptions(path.resolve(root, '../../dist/apps/demo-ecommerce')),
});
