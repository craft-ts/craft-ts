import { defineConfig } from 'vitest/config';
import * as path from 'node:path';

const root = '/Users/romaingeffrault/Documents/projects/prive/ng-craft';

export default defineConfig({
  root,
  resolve: {
    alias: {
      'test-type': path.join(root, 'libs/test-type/src/index.ts'),
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
    setupFiles: [path.join(root, 'libs/core/vitest.scratch.setup.ts')],
    environment: 'jsdom',
    include: ['libs/core/src/**/*.spec.ts'],
    reporters: ['default'],
  },
});
