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
        'libs/review-attestation/src/index.ts',
      ),
      '@craft-ts/dev-tools/attestation-review': path.join(
        root,
        'libs/dev-tools/src/attestation-review.ts',
      ),
      'test-type': path.join(root, 'libs/test-type/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['libs/review-attestation/src/**/*.spec.ts'],
    // The browser suite is Playwright's, not vitest's: jsdom returns zeroes for
    // every box, so running those files here would pass while proving nothing.
    exclude: ['libs/review-attestation/e2e/**'],
    reporters: ['default'],
  },
});
