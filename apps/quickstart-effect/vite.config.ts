/// <reference types="vite/client" />
import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/apps/quickstart-effect',
  plugins: [nxViteTsPaths()],
  server: {
    port: 4202,
    fs: { allow: [path.resolve(root, '../..')] },
  },
  build: {
    outDir: path.resolve(root, '../../dist/apps/quickstart-effect'),
    emptyOutDir: true,
  },
});
