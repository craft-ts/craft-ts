/// <reference types="vite/client" />
import { defineConfig, type ViteDevServer } from 'vite';
import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { craftTextLoaderPlugin } from '../../tools/vite-text-loader-plugin.mjs';
import { craftProductionBuildOptions } from '../../tools/vite-production-options.mjs';
import { craftStyle } from '../../libs/style/src/plugin/vite.ts';

const root = path.dirname(fileURLToPath(import.meta.url));
function serverFunctionsPlugin() {
  return {
    name: 'ecommerce-server-functions',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__craft_resume_graph', (request, response) => {
        if (
          request.method !== 'GET' ||
          !isLoopbackHost(request.headers.host) ||
          !isLoopbackAddress(request.socket.remoteAddress)
        ) {
          response.statusCode = 403;
          response.end();
          return;
        }
        void readFile(path.resolve(root, '.craft/resume-graph.json'), 'utf8')
          .then((graph) => {
            response.statusCode = 200;
            response.setHeader(
              'content-type',
              'application/json; charset=utf-8',
            );
            response.setHeader('cache-control', 'no-store');
            response.end(graph);
          })
          .catch(() => {
            response.statusCode = 503;
            response.end(
              'Resume graph is not available. Run the demo resume-check target.',
            );
          });
      });
      // Les e2e de reprise révoquent les sessions entre l'enregistrement et la
      // reprise : un ancien jeton encore valide masquerait une reconnexion ratée.
      if (process.env['CRAFT_E2E'] === '1')
        server.middlewares.use('/__dev/auth/revoke-all', (request, response) => {
          if (
            request.method !== 'POST' ||
            !isLoopbackHost(request.headers.host) ||
            !isLoopbackAddress(request.socket.remoteAddress)
          ) {
            response.statusCode = 403;
            response.end();
            return;
          }
          void server
            .ssrLoadModule('/src/server/auth.ts')
            .then(({ revokeAllSessions }) => {
              response.statusCode = 200;
              response.setHeader('content-type', 'application/json');
              response.end(JSON.stringify({ revoked: revokeAllSessions() }));
            })
            .catch((error: unknown) => {
              response.statusCode = 500;
              response.end();
              console.error(error);
            });
        });
      server.middlewares.use('/__server-functions', (request, response) => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(request.headers))
          if (value !== undefined)
            headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        const method = request.method ?? 'GET';
        const hasBody = method !== 'GET' && method !== 'HEAD';
        const allowResumePreflight =
          isLoopbackHost(request.headers.host) &&
          isLoopbackAddress(request.socket.remoteAddress);
        const webRequest = new Request(
          `http://${request.headers.host ?? 'localhost'}${request.url ?? '/'}`,
          {
            method,
            headers,
            ...(hasBody
              ? { body: request as unknown as BodyInit, duplex: 'half' }
              : {}),
          } as RequestInit,
        );
        // Chargé à chaque requête : Vite garde le module en cache et ne le
        // recharge qu'après une modification du code serveur.
        void server
          .ssrLoadModule('/src/server/server.ts')
          .then(({ handleDemoRequest }) =>
            handleDemoRequest(webRequest, {
              allowResumePreflight,
            }),
          )
          .then(async (result) => {
            response.statusCode = result.status;
            result.headers.forEach((value, key) =>
              response.setHeader(key, value),
            );
            response.end(Buffer.from(await result.arrayBuffer()));
          })
          .catch((error: unknown) => {
            if (!response.headersSent) response.statusCode = 500;
            response.end('Internal Server Error');
            console.error(error);
          });
      });
    },
  };
}

function isLoopbackHost(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const hostname = new URL(`http://${value}`).hostname.replace(
      /^\[|\]$/g,
      '',
    );
    return (
      hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
    );
  } catch {
    return false;
  }
}

function isLoopbackAddress(value: string | undefined): boolean {
  return (
    value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1'
  );
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
