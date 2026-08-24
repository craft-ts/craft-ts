/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: path.dirname(fileURLToPath(import.meta.url)),
  cacheDir: '../../node_modules/.vite/libs/deploy',
  plugins: [],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'craft-ts-deploy',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: [],
    reporters: ['default'],
  },
});
