/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { behaviorProofReporter } from '../../libs/dev-tools/src/scripts/behavior-proof-index.ts';
const root = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(root, '../..');
export default defineConfig({
  root,
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@craft-ts/core': path.join(workspaceRoot, 'libs/core/src/index.ts'),
      '@craft-ts/effect': path.join(workspaceRoot, 'libs/effect/src/index.ts'),
    },
  },
  test: {
    name: 'demo-ecommerce',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    globalSetup: ['src/client/pages.global-setup.ts'],
    // Each passing test leaves the fingerprint of what it exercised in
    // .craft/behavior-proofs.json, which the architecture suite reads.
    setupFiles: [path.join(workspaceRoot, 'libs/core/src/behavior-proofs.vitest-setup.ts')],
    reporters: ['default', behaviorProofReporter({ rootDir: root })],
  },
});
