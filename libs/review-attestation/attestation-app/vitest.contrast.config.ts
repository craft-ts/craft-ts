import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');

export default defineConfig({
  root,
  resolve: {
    alias: {
      '@craft-ts/core': resolve(root, 'libs/core/src/index.ts'),
      '@craft-ts/component': resolve(root, 'libs/component/src/index.ts'),
      '@craft-ts/dev-tools': resolve(root, 'libs/dev-tools/src/index.ts'),
      '@craft-ts/style/vite': resolve(root, 'libs/style/src/plugin/vite.ts'),
      '@craft-ts/style': resolve(root, 'libs/style/src/index.ts'),
    },
  },
  test: {
    name: 'craft-ts-review-app-contrast',
    globals: true,
    environment: 'node',
    include: ['libs/review-attestation/attestation-app/src/**/*.contrast.spec.ts'],
  },
});
