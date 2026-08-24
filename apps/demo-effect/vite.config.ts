/// <reference types="vite/client" />
import { defineConfig } from 'vite';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { craftTextLoaderPlugin } from '../../tools/vite-text-loader-plugin.mjs';
import { craftProductionBuildOptions } from '../../tools/vite-production-options.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/apps/demo-effect',
  publicDir: 'public',
  plugins: [craftTextLoaderPlugin()],
  server: {
    port: 4201,
    fs: {
      allow: [path.resolve(root, '../..')],
    },
  },
  resolve: {
    tsconfigPaths: true,
    mainFields: ['module', 'browser', 'jsnext:main', 'jsnext'],
  },
  build: craftProductionBuildOptions(
    path.resolve(root, '../../dist/apps/demo-effect'),
  ),
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
      },
    },
  },
});
