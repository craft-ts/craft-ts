/// <reference types="vitest" />
import * as path from 'node:path';
import { defineConfig } from 'vitest/config';

const workspace = path.resolve(import.meta.dirname, '../..');
const lib = (name: string, entry = 'src/index.ts') =>
  path.join(workspace, 'libs', name, entry);

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: path.join(workspace, 'node_modules/.vite/apps/docs-herbier-test'),
  resolve: {
    alias: {
      '@craft-ts/core': lib('core'),
      '@craft-ts/component': lib('component'),
      '@craft-ts/style/vite': lib('style', 'src/plugin/vite.ts'),
      '@craft-ts/style': lib('style'),
      '@craft-ts/docs-ui/node': lib('docs-ui', 'src/node.ts'),
      '@craft-ts/docs-ui/style': lib('docs-ui', 'src/style.ts'),
      '@craft-ts/docs-ui': lib('docs-ui'),
      '@craft-ts/dev-tools/template-migration': lib('dev-tools', 'src/template-migration.ts'),
      'virtual:craft-style.css': path.join(import.meta.dirname, 'src/empty.css'),
    },
  },
  test: {
    name: 'docs-herbier',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    testTimeout: 60_000,
  },
});
