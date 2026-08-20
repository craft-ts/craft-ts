/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { craftTextLoaderPlugin } from '../../tools/vite-text-loader-plugin.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(root, '../..');

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/apps/demo-effect-test',
  plugins: [craftTextLoaderPlugin()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@craft-ts/core': path.join(workspaceRoot, 'libs/core/src/index.ts'),
      '@craft-ts/component': path.join(
        workspaceRoot,
        'libs/component/src/index.ts',
      ),
      'test-type': path.join(workspaceRoot, 'libs/test-type/src/index.ts'),
    },
  },
  test: {
    name: 'demo-effect',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
  },
});
