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
  cacheDir: '../../node_modules/.vite/libs/stream',
  plugins: [],
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@craft-ts/core': path.join(workspaceRoot, 'libs/core/src/index.ts'),
      '@craft-ts/stream': path.join(workspaceRoot, 'libs/stream/src/index.ts'),
      // Integration specs render a real component (tests only, no runtime dep).
      '@craft-ts/component': path.join(
        workspaceRoot,
        'libs/component/src/index.ts',
      ),
      '@craft-ts/effect': path.join(workspaceRoot, 'libs/effect/src/index.ts'),
      '@craft-ts/style': path.join(workspaceRoot, 'libs/style/src/index.ts'),
      'test-type': path.join(workspaceRoot, 'libs/test-type/src/index.ts'),
    },
  },
  test: {
    name: 'craft-ts-stream',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    // Typing-only specs (compiled by tsc, never executed).
    exclude: ['**/*.prototype.spec.ts'],
    reporters: ['default'],
  },
});
