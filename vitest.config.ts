/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: workspaceRoot,
  cacheDir: path.join(workspaceRoot, 'node_modules/.vite/craft-ts'),
  plugins: [],
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@craft-ts/core': path.join(workspaceRoot, 'libs/core/src/index.ts'),
      '@craft-ts/component': path.join(
        workspaceRoot,
        'libs/component/src/index.ts',
      ),
      '@craft-ts/effect': path.join(workspaceRoot, 'libs/effect/src/index.ts'),
      'test-type': path.join(workspaceRoot, 'libs/test-type/src/index.ts'),
    },
  },
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: [
      'libs/core/src/**/*.spec.ts',
      'libs/component/src/**/*.spec.ts',
      'libs/effect/src/**/*.spec.ts',
      'tools/**/*.spec.ts',
    ],
    reporters: ['default'],
  },
});
