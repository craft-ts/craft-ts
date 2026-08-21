/// <reference types="vitest" />
import { defineConfig } from 'vite';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(root, '../..');

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/demo-ssr-architecture',
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@craft-ts/dev-tools': path.join(
        workspaceRoot,
        'libs/dev-tools/src/index.ts',
      ),
    },
  },
  test: {
    name: 'demo-ssr-architecture',
    watch: false,
    globals: true,
    environment: 'node',
    testTimeout: 180_000,
    hookTimeout: 180_000,
    include: ['architecture/**/*.spec.ts'],
  },
});
