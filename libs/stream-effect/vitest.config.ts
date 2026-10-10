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
  cacheDir: '../../node_modules/.vite/libs/stream-effect',
  plugins: [],
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@craft-ts/core': path.join(workspaceRoot, 'libs/core/src/index.ts'),
      '@craft-ts/effect': path.join(workspaceRoot, 'libs/effect/src/index.ts'),
      '@craft-ts/stream': path.join(workspaceRoot, 'libs/stream/src/index.ts'),
      '@craft-ts/stream-effect': path.join(
        workspaceRoot,
        'libs/stream-effect/src/index.ts',
      ),
    },
  },
  test: {
    name: 'craft-ts-stream-effect',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    exclude: ['**/*.prototype.spec.ts'],
    reporters: ['default'],
  },
});
