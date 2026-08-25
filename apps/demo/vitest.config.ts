/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { craftTextLoaderPlugin } from '../../tools/vite-text-loader-plugin.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(root, '../..');

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/apps/demo-test',
  plugins: [craftTextLoaderPlugin()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@craft-ts/core': path.join(workspaceRoot, 'libs/core/src/index.ts'),
      '@craft-ts/component': path.join(
        workspaceRoot,
        'libs/component/src/index.ts',
      ),

      '@craft-ts/style-testing': path.join(
        workspaceRoot,
        'libs/style-testing/src/index.ts',
      ),
      // More specific first: a bare '@craft-ts/style' alias matches this
      // specifier as a prefix and would swallow it.
      '@craft-ts/style/vite': path.join(
        workspaceRoot,
        'libs/style/src/plugin/vite.ts',
      ),
      '@craft-ts/style': path.join(workspaceRoot, 'libs/style/src/index.ts'),
      '@craft-ts/dev-tools': path.join(
        workspaceRoot,
        'libs/dev-tools/src/index.ts',
      ),
      'test-type': path.join(workspaceRoot, 'libs/test-type/src/index.ts'),
    },
  },
  test: {
    name: 'demo',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
  },
});
