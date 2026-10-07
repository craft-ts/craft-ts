/// <reference types="vite/client" />
import * as path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type ViteDevServer } from 'vite';
import { loadCraftStyle } from '../../tools/vite-craft-style-loader.mjs';
import { craftProductionBuildOptions } from '../../tools/vite-production-options.mjs';

const craftStyle = await loadCraftStyle();

const root = import.meta.dirname;
const workspace = path.resolve(root, '../..');
// The pages are the ones of `apps/docs`, read in place: the two sites show the same
// Markdown, which is what makes them comparable.
process.env['DOCS_SRC'] ??= path.resolve(root, '../docs');

/** Requests that are the module graph or a file, not a page. */
const isAsset = (pathname: string): boolean =>
  pathname.startsWith('/src/') ||
  pathname.startsWith('/@') ||
  pathname.startsWith('/node_modules/') ||
  (/\.[a-z0-9]+$/i.test(pathname) && !pathname.endsWith('.html'));

/**
 * The dev server draws a page when it is asked for it, with the same code the build
 * uses: parse the Markdown, render the root component on the server, send the document.
 * The browser bundle is the module graph, so editing a component reloads the page.
 */
function docsRenderer() {
  return {
    name: 'docs-herbier-renderer',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => {
        const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
        if (url.pathname === '/search-index.json') {
          void (async () => {
            try {
              const dev = await server.ssrLoadModule('/src/server/dev.ts');
              response.setHeader('content-type', 'application/json');
              response.end(JSON.stringify(await dev.devSearchIndex()));
            } catch (error) {
              next(error);
            }
          })();
          return;
        }
        if (url.pathname.startsWith('/page-data/') && url.pathname.endsWith('.json')) {
          void (async () => {
            try {
              const dev = await server.ssrLoadModule('/src/server/dev.ts');
              const page = await dev.devPageData(
                url.pathname.slice('/page-data'.length).replace(/\.json$/, '').replace(/\/index$/, '/'),
                '/',
              );
              response.statusCode = page ? 200 : 404;
              response.setHeader('content-type', 'application/json');
              response.end(JSON.stringify(page ?? null));
            } catch (error) {
              next(error);
            }
          })();
          return;
        }
        if (isAsset(url.pathname)) {
          next();
          return;
        }
        void (async () => {
          try {
            const dev = await server.ssrLoadModule('/src/server/dev.ts');
            const result = await dev.renderDevPage(
              url.pathname,
              {
                scripts: ['/src/client.ts'],
                // The emitted stylesheet as CSS, so the drawn page is styled before any script runs.
                styles: ['/@id/__x00__virtual:craft-style.css?direct'],
              },
              '/',
            );
            response.statusCode = result.status;
            response.setHeader('content-type', 'text/html; charset=utf-8');
            response.end(await server.transformIndexHtml(url.pathname, result.html));
          } catch (error) {
            next(error);
          }
        })();
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  root,
  cacheDir: path.resolve(workspace, 'node_modules/.vite/apps/docs-herbier'),
  // On GitHub Pages the site lives under `/craft/`; in development it is the root.
  base: process.env['DOCS_BASE'] ?? (command === 'build' ? '/craft/' : '/'),
  publicDir: path.resolve(root, '../docs/public'),
  plugins: [
    docsRenderer(),
    craftStyle({
      // The sheets of the framework and of the docs theme live outside this app's root.
      include: [
        path.resolve(workspace, 'libs/component/src'),
        path.resolve(workspace, 'libs/docs-ui/src'),
      ],
      alias: {
        '@craft-ts/style': path.resolve(workspace, 'libs/style/src/index.ts'),
        '@craft-ts/core': path.resolve(workspace, 'libs/core/src/index.ts'),
        '@craft-ts/component/style': path.resolve(workspace, 'libs/component/src/style.ts'),
        '@craft-ts/component': path.resolve(workspace, 'libs/component/src/index.ts'),
        '@craft-ts/docs-ui/style': path.resolve(workspace, 'libs/docs-ui/src/style.ts'),
      },
    }),
  ],
  server: {
    port: 4420,
    forwardConsole: true,
    fs: { allow: [workspace] },
  },
  resolve: { tsconfigPaths: true },
  build: craftProductionBuildOptions(path.resolve(workspace, 'dist/apps/docs-herbier'), {
    manifest: true,
    assetsDir: 'static',
    cssCodeSplit: false,
    rollupOptions: { input: path.resolve(root, 'src/client.ts') },
  }),
}));
