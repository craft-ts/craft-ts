/// <reference types="vite/client" />
import { readFileSync } from 'node:fs';
import { defineConfig, type ViteDevServer } from 'vite';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { craftTextLoaderPlugin } from '../../tools/vite-text-loader-plugin.mjs';

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
  ],
  server: {
    port: 4200,
    fs: {
      allow: [path.resolve(root, '../..')],
    },
  },
  resolve: {
    mainFields: ['module', 'browser', 'jsnext:main', 'jsnext'],
    tsconfigPaths: true,
  },
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
  },
});
