/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { behaviorProofReporter } from '../../dev-tools/src/scripts/behavior-proof-index.ts';

const root = import.meta.dirname;
const workspaceRoot = resolve(root, '../../..');

// As vite.config.ts resolves them, the more specific subpaths first.
const aliases = {
  '@craft-ts/core': resolve(root, '../../core/src/index.ts'),
  '@craft-ts/component': resolve(root, '../../component/src/index.ts'),
  // The review server's own plugin, before the bare entry swallows it.
  '@craft-ts/style/vite': resolve(root, '../../style/src/plugin/vite.ts'),
  '@craft-ts/style': resolve(root, '../../style/src/index.ts'),
  '@craft-ts/style-testing/review/frame': resolve(root, '../src/lib/review/frame.ts'),
  '@craft-ts/style-testing/review': resolve(root, '../src/lib/review/index.ts'),
  '@craft-ts/style-testing': resolve(root, '../src/index.ts'),
  '@craft-ts/dev-tools/contrast': resolve(root, '../../dev-tools/src/scripts/contrast.ts'),
  '@craft-ts/dev-tools/attestation-review': resolve(
    root,
    '../../dev-tools/src/attestation-review.ts',
  ),
};

export default defineConfig({
  root,
  cacheDir: '../../../node_modules/.vite/libs/review-attestation-app-test',
  resolve: { alias: aliases },
  test: {
    name: 'craft-ts-review-app',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    // The contrast specs read the style sheets in Node: vitest.contrast.config.ts.
    exclude: ['src/**/*.contrast.spec.ts'],
    globalSetup: ['test/review-servers.global-setup.ts'],
    testTimeout: 20_000,
    // Each passing test leaves the fingerprint of what it exercised in
    // .craft/behavior-proofs.json, which the architecture suite reads.
    setupFiles: [
      'test/browser.setup.ts',
      resolve(workspaceRoot, 'libs/core/src/behavior-proofs.vitest-setup.ts'),
    ],
    reporters: ['default', behaviorProofReporter({ rootDir: root })],
  },
});
