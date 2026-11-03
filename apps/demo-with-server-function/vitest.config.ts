/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { behaviorProofReporter } from '../../libs/dev-tools/src/scripts/behavior-proof-index.ts';

const root = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(root, '../..');

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/apps/demo-with-server-function',
  plugins: [],
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@craft-ts/core': path.join(workspaceRoot, 'libs/core/src/index.ts'),
      '@craft-ts/effect': path.join(workspaceRoot, 'libs/effect/src/index.ts'),
      '@craft-ts/dev-tools/architecture-graph': path.join(
        workspaceRoot,
        'libs/dev-tools/src/scripts/architecture-graph.ts',
      ),
      '@craft-ts/dev-tools/dependency-graph': path.join(
        workspaceRoot,
        'libs/dev-tools/src/scripts/dependency-graph.ts',
      ),
    },
  },
  test: {
    name: 'demo-with-server-function',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    globalSetup: ['src/client/pages.global-setup.ts'],
    // Each passing test leaves the fingerprint of what it exercised in
    // .craft/behavior-proofs.json, which the architecture suite reads.
    setupFiles: [path.join(workspaceRoot, 'libs/core/src/behavior-proofs.vitest-setup.ts')],
    reporters: ['default', behaviorProofReporter({ rootDir: root })],
  },
});
