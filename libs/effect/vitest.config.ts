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
  cacheDir: '../../node_modules/.vite/libs/effect',
  plugins: [],
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@craft-ts/core': path.join(workspaceRoot, 'libs/core/src/index.ts'),
      '@craft-ts/effect': path.join(workspaceRoot, 'libs/effect/src/index.ts'),
    },
  },
  test: {
    name: 'craft-ts-effect',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    exclude: [],
    reporters: ['default'],
  },
});
