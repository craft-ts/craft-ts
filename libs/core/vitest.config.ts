/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

export default defineConfig({
  root: path.dirname(fileURLToPath(import.meta.url)),
  cacheDir: '../../node_modules/.vite/libs/core',
  plugins: [nxViteTsPaths()],
  resolve: {
    alias: {
      '@craft-ng/core': path.join(workspaceRoot, 'libs/core/src/index.ts'),
      '@craft-ng/component': path.join(
        workspaceRoot,
        'libs/component/src/index.ts',
      ),
      '@craft-ng/angular': path.join(
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
    name: 'ng-craft-core',
    globals: true,
    environment: 'jsdom',
    include: ['src/lib/state.spec.ts', 'src/lib/host/**/*.spec.ts'],
    reporters: ['default'],
  },
});
