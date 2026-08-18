/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(root, '../..');

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/apps/demo-with-server-function',
  plugins: [nxViteTsPaths()],
  resolve: {
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
    reporters: ['default'],
  },
});
