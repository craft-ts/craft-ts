/// <reference types="vite/client" />
import { defineConfig, type ViteDevServer } from 'vite';
import * as path from 'node:path';
import { craftProductionBuildOptions } from '../../tools/vite-production-options.mjs';

const PAGE_PREFIXES = ['/src/', '/@', '/node_modules/', '/assets/', '/favicon'];

function ssrDemoPlugin() {
  return {
    name: 'demo-ssr-renderer',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((request, response, next) => {
        const requestUrl = request.url ?? '/';
        const url = new URL(
          requestUrl,
          `http://${request.headers.host ?? 'localhost'}`,
        );

        if (PAGE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
          next();
          return;
        }

        void (async () => {
          try {
            const renderer = await server.ssrLoadModule('/src/server.ts');

            if (url.pathname === '/__server-functions') {
              if (request.method !== 'POST') {
                response.statusCode = 405;
                response.setHeader('allow', 'POST');
                response.end();
                return;
              }
              await renderer.handleServerFunctionRequest(
                request,
                response,
                renderer.authenticatedUserFromRequest(request),
              );
              return;
            }

            if (url.pathname === '/api/deferred') {
              const payload = await renderer.renderDeferredApi();
              response.statusCode = 200;
              response.setHeader(
                'content-type',
                'application/json; charset=utf-8',
              );
              response.setHeader('cache-control', 'no-store');
              response.end(JSON.stringify(payload));
              return;
            }

            const result = await renderer.renderPage(url);
            response.statusCode = result.status;
            response.setHeader('content-type', 'text/html; charset=utf-8');
            response.setHeader('x-demo-rendered-by', 'ssr');
            response.end(result.html);
          } catch (error) {
            next(error);
          }
        })();
      });
    },
  };
}

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/demo-ssr',
  publicDir: 'public',
  plugins: [ssrDemoPlugin()],
  server: {
    port: 4300,
    fs: {
      allow: ['../..'],
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  build: craftProductionBuildOptions(
    path.resolve(import.meta.dirname, '../../dist/apps/demo-ssr'),
    { manifest: true },
  ),
});
