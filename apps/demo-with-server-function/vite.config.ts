/// <reference types="vite/client" />
import { defineConfig, type ViteDevServer } from 'vite';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { craftTextLoaderPlugin } from '../../tools/vite-text-loader-plugin.mjs';
import { craftProductionBuildOptions } from '../../tools/vite-production-options.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

function serverFunctionsPlugin() {
  return {
    name: 'demo-server-functions',
    async configureServer(server: ViteDevServer) {
      const { handleDemoNodeRequest } = await server.ssrLoadModule(
        '/src/server/server.ts',
      );
      server.middlewares.use('/__server-functions', (request, response) => {
        void handleDemoNodeRequest(request, response).catch((error: unknown) => {
          if (!response.headersSent) response.statusCode = 500;
          response.end('Internal Server Error');
          console.error(error);
        });
      });
    },
  };
}

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/apps/demo-with-server-function',
  publicDir: false,
  plugins: [craftTextLoaderPlugin(), serverFunctionsPlugin()],
  server: {
    port: 4202,
    fs: {
      allow: [path.resolve(root, '../..')],
    },
  },
  resolve: {
    tsconfigPaths: true,
    mainFields: ['module', 'browser', 'jsnext:main', 'jsnext'],
  },
  build: craftProductionBuildOptions(
    path.resolve(root, '../../dist/apps/demo-with-server-function'),
  ),
});
