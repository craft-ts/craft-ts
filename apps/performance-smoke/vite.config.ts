import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { craftStyle } from '../../libs/style/src/plugin/vite.ts';
import { craftProductionBuildOptions } from '../../tools/vite-production-options.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(directory, '../..');
const aliases = {
  '@craft-ts/core': resolve(workspace, 'libs/core/src/index.ts'),
  '@craft-ts/component': resolve(workspace, 'libs/component/src/index.ts'),
  '@craft-ts/style': resolve(workspace, 'libs/style/src/index.ts'),
};

export default defineConfig({
  // The runner uses a disposable copy when editing files to measure reloads.
  root: process.env['CRAFT_PERF_ROOT'] ?? directory,
  cacheDir:
    process.env['CRAFT_PERF_CACHE'] ??
    resolve(workspace, 'node_modules/.vite/performance-smoke'),
  plugins: [
    craftStyle({
      alias: aliases,
      include: [resolve(workspace, 'libs/component/src')],
    }),
  ],
  resolve: { alias: aliases },
  server: {
    host: '127.0.0.1',
    port: 4299,
    strictPort: true,
    fs: { allow: [workspace] },
  },
  build: craftProductionBuildOptions(
    process.env['CRAFT_PERF_DIST'] ??
      resolve(workspace, 'dist/apps/performance-smoke'),
  ),
});
