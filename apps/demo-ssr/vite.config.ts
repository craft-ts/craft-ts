/// <reference types="vite/client" />
import { readFileSync } from 'node:fs';
import { defineConfig, type ViteDevServer } from 'vite';
import * as path from 'node:path';
import { craftProductionBuildOptions } from '../../tools/vite-production-options.mjs';

const PAGE_PREFIXES = ['/src/', '/@', '/node_modules/', '/assets/', '/favicon'];
const typecheckStatusPath = path.resolve(
  import.meta.dirname,
  '../../tmp/demo-ssr-typecheck-status.json',
);

function readTypecheckStatus(): {
  status: 'running' | 'passed' | 'failed';
} {
  try {
    const status = JSON.parse(readFileSync(typecheckStatusPath, 'utf8'));
    if (
      status?.status === 'running' ||
      status?.status === 'passed' ||
      status?.status === 'failed'
    ) {
      return { status: status.status };
    }
  } catch {
    // The type-check process may not have written its first status yet.
  }
  return { status: 'running' };
}

function demoSsrTypecheckStatusPlugin() {
  return {
    name: 'demo-ssr-typecheck-status',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__demo-ssr/typecheck', (_request, response) => {
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.setHeader('cache-control', 'no-store');
        response.end(JSON.stringify(readTypecheckStatus()));
      });
    },
  };
}

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
  plugins: [demoSsrTypecheckStatusPlugin(), ssrDemoPlugin()],
  server: {
    port: 4300,
    forwardConsole: true,
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
