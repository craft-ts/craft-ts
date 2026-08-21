import { defineConfig } from 'vitest/config';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(root, '../..');

export default defineConfig(() => ({
  root,
  cacheDir: '../../node_modules/.vite/apps/docs',
  plugins: [],
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@craft-ts/core': path.join(workspaceRoot, 'libs/core/src/index.ts'),
      '@craft-ts/component/testing': path.join(
        workspaceRoot,
        'libs/component/testing/public-api.ts',
      ),
      '@craft-ts/component': path.join(
        workspaceRoot,
        'libs/component/src/index.ts',
      ),
      '@craft-ts/effect': path.join(
        workspaceRoot,
        'libs/effect/src/index.ts',
      ),
      '@craft-ts/dev-tools/testing': path.join(
        workspaceRoot,
        'libs/dev-tools/src/testing.ts',
      ),
      '@craft-ts/dev-tools/architecture-graph': path.join(
        workspaceRoot,
        'libs/dev-tools/src/scripts/architecture-graph.ts',
      ),
      '@craft-ts/dev-tools/dependency-graph': path.join(
        workspaceRoot,
        'libs/dev-tools/src/scripts/dependency-graph.ts',
      ),
      '@craft-ts/dev-tools': path.join(
        workspaceRoot,
        'libs/dev-tools/src/index.ts',
      ),
      'test-type': path.join(workspaceRoot, 'libs/test-type/src/index.ts'),
    },
  },
  test: {
    name: 'docs',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/docs',
      provider: 'v8' as const,
    },
  },
}));
