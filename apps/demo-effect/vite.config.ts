/// <reference types="vite/client" />
import { readFileSync } from 'node:fs';
import { defineConfig, type ViteDevServer } from 'vite';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { craftTextLoaderPlugin } from '../../tools/vite-text-loader-plugin.mjs';
import { craftProductionBuildOptions } from '../../tools/vite-production-options.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const typecheckStatusPath = path.resolve(
  root,
  '../../tmp/demo-effect-typecheck-status.json',
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

function demoEffectTypecheckStatusPlugin() {
  return {
    name: 'demo-effect-typecheck-status',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__demo-effect/typecheck', (_request, response) => {
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
  cacheDir: '../../node_modules/.vite/apps/demo-effect',
  publicDir: 'public',
  plugins: [craftTextLoaderPlugin(), demoEffectTypecheckStatusPlugin()],
  server: {
    port: 4201,
    forwardConsole: true,
    fs: {
      allow: [path.resolve(root, '../..')],
    },
  },
  resolve: {
    tsconfigPaths: true,
    mainFields: ['module', 'browser', 'jsnext:main', 'jsnext'],
  },
  build: craftProductionBuildOptions(
    path.resolve(root, '../../dist/apps/demo-effect'),
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
