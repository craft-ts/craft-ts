/// <reference types="vite/client" />
import { defineConfig } from 'vite';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { craftStyle } from '../style/src/plugin/vite.ts';

/**
 * The preview harness: every component of the package in a browser, light and
 * dark, to be compared with the mock-up. Not shipped.
 */
const root = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(root, '../..');

export default defineConfig({
  root,
  cacheDir: path.resolve(workspace, 'node_modules/.vite/libs/docs-ui-preview'),
  plugins: [
    craftStyle({
      include: [path.resolve(workspace, 'libs/component/src')],
      alias: {
        '@craft-ts/style': path.resolve(workspace, 'libs/style/src/index.ts'),
        '@craft-ts/core': path.resolve(workspace, 'libs/core/src/index.ts'),
        '@craft-ts/component/style': path.resolve(workspace, 'libs/component/src/style.ts'),
        '@craft-ts/component': path.resolve(workspace, 'libs/component/src/index.ts'),
      },
    }),
  ],
  server: {
    port: 4410,
    forwardConsole: true,
    fs: { allow: [workspace] },
  },
  resolve: {
    mainFields: ['module', 'browser', 'jsnext:main', 'jsnext'],
    // The workspace sources, longest specifier first: an alias matches by prefix.
    alias: [
      { find: '@craft-ts/style/vite', replacement: path.resolve(workspace, 'libs/style/src/plugin/vite.ts') },
      { find: '@craft-ts/style', replacement: path.resolve(workspace, 'libs/style/src/index.ts') },
      { find: '@craft-ts/component/style', replacement: path.resolve(workspace, 'libs/component/src/style.ts') },
      { find: '@craft-ts/component', replacement: path.resolve(workspace, 'libs/component/src/index.ts') },
      { find: '@craft-ts/core', replacement: path.resolve(workspace, 'libs/core/src/index.ts') },
      { find: '@craft-ts/docs-ui', replacement: path.resolve(workspace, 'libs/docs-ui/src/index.ts') },
    ],
  },
  esbuild: {
    tsconfigRaw: {
      compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false },
    },
  },
});
