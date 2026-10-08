/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

export default defineConfig({
  root: path.dirname(fileURLToPath(import.meta.url)),
  cacheDir: '../../node_modules/.vite/libs/docs-ui',
  resolve: {
    alias: {
      '@craft-ts/core': path.join(workspaceRoot, 'libs/core/src/index.ts'),
      '@craft-ts/component': path.join(
        workspaceRoot,
        'libs/component/src/index.ts',
      ),
      '@craft-ts/dev-tools/contrast': path.join(
        workspaceRoot,
        'libs/dev-tools/src/scripts/contrast.ts',
      ),
      '@craft-ts/style/vite': path.join(
        workspaceRoot,
        'libs/style/src/plugin/vite.ts',
      ),
      '@craft-ts/style': path.join(workspaceRoot, 'libs/style/src/index.ts'),
      '@craft-ts/docs-ui/style': path.join(workspaceRoot, 'libs/docs-ui/src/style.ts'),
      '@craft-ts/docs-ui/node': path.join(workspaceRoot, 'libs/docs-ui/src/node.ts'),
      '@craft-ts/docs-ui': path.join(
        workspaceRoot,
        'libs/docs-ui/src/index.ts',
      ),
      'test-type': path.join(workspaceRoot, 'libs/test-type/src/index.ts'),
    },
  },
  test: {
    name: 'craft-ts-docs-ui',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
  },
});
