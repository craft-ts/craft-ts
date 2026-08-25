/// <reference types="vite/client" />
import { readFileSync } from 'node:fs';
import { defineConfig, type ViteDevServer } from 'vite';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { craftTextLoaderPlugin } from '../../tools/vite-text-loader-plugin.mjs';
// Imported by path, like the other plugins in this config: a Vite config file
// is loaded by Node before any alias exists, so a workspace package specifier
// would not resolve here.
import { craftStyle } from '../../libs/style/src/plugin/vite.ts';
import { craftProductionBuildOptions } from '../../tools/vite-production-options.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const typecheckStatusPath = path.resolve(
  root,
  '../../tmp/demo-typecheck-status.json',
);

function readTypecheckStatus(): { status: 'running' | 'passed' | 'failed' } {
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

function demoTypecheckStatusPlugin() {
  return {
    name: 'demo-typecheck-status',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__demo/typecheck', (_request, response) => {
        response.statusCode = 200;
        response.setHeader('content-type', 'application/json');
        response.setHeader('cache-control', 'no-store');
        response.end(JSON.stringify(readTypecheckStatus()));
      });
    },
  };
}

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/apps/demo',
  publicDir: 'public',
  plugins: [
    craftTextLoaderPlugin(),
    demoTypecheckStatusPlugin(),
    // Evaluates every `*.style.ts` in Node and serves the whole sheet as
    // `virtual:craft-style.css`. The aliases are the workspace ones: outside
    // the monorepo, node resolution finds the packages on its own.
    craftStyle({
      alias: {
        '@craft-ts/style': path.resolve(root, '../../libs/style/src/index.ts'),
        '@craft-ts/core': path.resolve(root, '../../libs/core/src/index.ts'),
        '@craft-ts/component': path.resolve(
          root,
          '../../libs/component/src/index.ts',
        ),
      },
    }),
  ],
  server: {
    port: 4200,
    forwardConsole: true,
    fs: {
      allow: [path.resolve(root, '../..')],
    },
  },
  resolve: {
    mainFields: ['module', 'browser', 'jsnext:main', 'jsnext'],
    tsconfigPaths: true,
  },
  build: craftProductionBuildOptions(
    path.resolve(root, '../../dist/apps/demo'),
  ),
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
  },
});
