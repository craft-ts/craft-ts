import { defineConfig } from 'vitest/config';
import * as path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

export default defineConfig({
  root,
  resolve: {
    alias: {
      '@craft-ng/core': path.join(root, 'libs/core/src/index.ts'),
      '@craft-ng/component': path.join(root, 'libs/component/src/index.ts'),
      '@craft-ng/style': path.join(root, 'libs/style/src/index.ts'),
      'test-type': path.join(root, 'libs/test-type/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['libs/style/**/*.spec.ts'],
    reporters: ['default'],
  },
});
