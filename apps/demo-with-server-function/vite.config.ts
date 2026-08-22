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
      const { createDemoNodeHandler } = await server.ssrLoadModule(
        '/src/server/server.ts',
      );
      const demo = createDemoNodeHandler();
      server.middlewares.use('/__server-functions', demo.handler);
      server.httpServer?.once('close', demo.close);
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
