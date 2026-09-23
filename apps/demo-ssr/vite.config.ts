/// <reference types="vite/client" />
import { readFileSync } from 'node:fs';
import { defineConfig, type ViteDevServer } from 'vite';
import * as path from 'node:path';
import { craftProductionBuildOptions } from '../../tools/vite-production-options.mjs';
import { craftStyle } from '../../libs/style/src/plugin/vite.ts';

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
  plugins: [
    demoSsrTypecheckStatusPlugin(),
    ssrDemoPlugin(),
    craftStyle({
      // TODO(style-only): the app is not migrated yet, so the foundation stays
      // off — turning the reset on would move every margin of the legacy CSS.
      // What the plugin emits today is the sheets of @craft-ts/component (the
      // AI overlay, the pending indicator, the skip link).
      reset: false,
      base: false,
      include: [path.resolve(import.meta.dirname, '../../libs/component/src')],
      alias: {
        '@craft-ts/style': path.resolve(
          import.meta.dirname,
          '../../libs/style/src/index.ts',
        ),
        '@craft-ts/core': path.resolve(
          import.meta.dirname,
          '../../libs/core/src/index.ts',
        ),
        '@craft-ts/component': path.resolve(
          import.meta.dirname,
          '../../libs/component/src/index.ts',
        ),
      },
    }),
  ],
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
