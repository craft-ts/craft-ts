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
  cacheDir: '../../node_modules/.vite/libs/component',
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
    name: 'ng-craft-component',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    exclude: [
      'src/lib/render/interpreter.spec.ts',
      'src/lib/assert-defined-input.spec.ts',
      'src/lib/block.spec.ts',
      'src/lib/a11y-control.spec.ts',
      'src/lib/composition.spec.ts',
      'src/lib/pending-block.spec.ts',
    ],
    reporters: ['default'],
  },
});
