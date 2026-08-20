/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  cacheDir: '../../node_modules/.vite/apps/quickstart-effect-test',
  plugins: [nxViteTsPaths()],
  test: {
    name: 'quickstart-effect',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
  },
});
