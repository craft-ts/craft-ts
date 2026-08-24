/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

export default defineConfig({
  root: path.dirname(fileURLToPath(import.meta.url)),
  cacheDir: '../../node_modules/.vite/libs/cli',
  plugins: [],
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@craft-ts/deploy': path.join(workspaceRoot, 'libs/deploy/src/index.ts'),
    },
  },
  test: {
    name: 'craft-ts-cli',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: [],
    reporters: ['default'],
  },
});
