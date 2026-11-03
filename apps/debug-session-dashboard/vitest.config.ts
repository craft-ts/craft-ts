/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { behaviorProofReporter } from '../../libs/dev-tools/src/scripts/behavior-proof-index.ts';

const root = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(root, '../..');

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/apps/debug-session-dashboard-test',
  resolve: {
    tsconfigPaths: true,
    // As vite.config.ts resolves them.
    alias: {
      '@craft-ts/core': path.join(workspaceRoot, 'libs/core/src/index.ts'),
      '@craft-ts/ui/style': path.join(workspaceRoot, 'libs/ui/src/style.ts'),
      '@craft-ts/ui': path.join(workspaceRoot, 'libs/ui/src/index.ts'),
      // The subpath first: the bare entry would match it as a prefix.
      '@craft-ts/component/style': path.join(workspaceRoot, 'libs/component/src/style.ts'),
      '@craft-ts/session-trace': path.join(workspaceRoot, 'packages/session-trace/src/index.ts'),
      '@craft-ts/component': path.join(workspaceRoot, 'libs/component/src/index.ts'),
      '@craft-ts/style': path.join(workspaceRoot, 'libs/style/src/index.ts'),
      '@craft-ts/i18n': path.join(workspaceRoot, 'libs/i18n/src/index.ts'),
    },
  },
  test: {
    name: 'debug-session-dashboard',
    globals: true,
    environment: 'jsdom',
    // A page waits on the archive over HTTP: longer than a waitFor.
    testTimeout: 20_000,
    include: ['src/**/*.spec.ts'],
    globalSetup: ['test/archive.global-setup.ts'],
    // Each passing test leaves the fingerprint of what it exercised in
    // .craft/behavior-proofs.json, which the architecture suite reads.
    setupFiles: [
      'test/browser.setup.ts',
      path.join(workspaceRoot, 'libs/core/src/behavior-proofs.vitest-setup.ts'),
    ],
    reporters: ['default', behaviorProofReporter({ rootDir: root })],
  },
});
