/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { behaviorProofReporter } from '../../libs/dev-tools/src/scripts/behavior-proof-index.ts';

const root = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(root, '../..');

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/apps/quickstart-effect-test',
  plugins: [],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'quickstart-effect',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    // Each passing test leaves the fingerprint of what it exercised in
    // .craft/behavior-proofs.json, which the architecture suite reads.
    setupFiles: [path.join(workspaceRoot, 'libs/core/src/behavior-proofs.vitest-setup.ts')],
    reporters: ['default', behaviorProofReporter({ rootDir: root })],
  },
});
