/// <reference types="vite/client" />
import { defineConfig, type ViteDevServer } from 'vite';

const PAGE_PREFIXES = ['/src/', '/@', '/node_modules/', '/assets/'];

function ssrDemoPlugin() {
  return {
    name: 'demo-ssr-renderer',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((request, response, next) => {
        const requestUrl = request.url ?? '/';
        const url = new URL(requestUrl, `http://${request.headers.host ?? 'localhost'}`);

        if (PAGE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
          next();
          return;
        }

        void (async () => {
          try {
            const renderer = await server.ssrLoadModule('/src/server.ts');

            if (url.pathname === '/api/deferred') {
              const payload = await renderer.renderDeferredApi();
              response.statusCode = 200;
              response.setHeader('content-type', 'application/json; charset=utf-8');
              response.setHeader('cache-control', 'no-store');
              response.end(JSON.stringify(payload));
              return;
            }

            const result = await renderer.renderPage(url, {
              'accept-language': request.headers['accept-language'],
              'user-agent': request.headers['user-agent'],
              cookie: request.headers.cookie,
            });
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
});
