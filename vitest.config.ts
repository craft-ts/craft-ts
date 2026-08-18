/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: workspaceRoot,
  cacheDir: path.join(workspaceRoot, 'node_modules/.vite/craft-ts'),
  plugins: [nxViteTsPaths()],
  resolve: {
    alias: {
      '@craft-ts/core': path.join(workspaceRoot, 'libs/core/src/index.ts'),
      '@craft-ts/component': path.join(
        workspaceRoot,
        'libs/component/src/index.ts',
      ),
      '@craft-ts/angular': path.join(
        workspaceRoot,
        'libs/angular/src/index.ts',
      ),
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
      'tools/**/*.spec.ts',
    ],
    reporters: ['default'],
  },
});
