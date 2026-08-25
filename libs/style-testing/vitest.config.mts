import { defineConfig } from 'vitest/config';
import * as path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

export default defineConfig({
  root,
  resolve: {
    alias: {
      '@craft-ts/core': path.join(root, 'libs/core/src/index.ts'),
      '@craft-ts/component': path.join(root, 'libs/component/src/index.ts'),
      '@craft-ts/style': path.join(root, 'libs/style/src/index.ts'),
      '@craft-ts/style-testing': path.join(
        root,
        'libs/style-testing/src/index.ts',
      ),
      'test-type': path.join(root, 'libs/test-type/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['libs/style-testing/**/*.spec.ts'],
    reporters: ['default'],
  },
});
