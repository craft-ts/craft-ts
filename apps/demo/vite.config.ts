/// <reference types="vite/client" />
import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { craftTextLoaderPlugin } from '../../tools/vite-text-loader-plugin.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/apps/demo',
  publicDir: 'public',
  plugins: [craftTextLoaderPlugin(), nxViteTsPaths()],
  server: {
    port: 4200,
    fs: {
      allow: [path.resolve(root, '../..')],
    },
  },
  resolve: {
    mainFields: ['module', 'browser', 'jsnext:main', 'jsnext'],
  },
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
  },
});
