/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: path.dirname(fileURLToPath(import.meta.url)),
  cacheDir: '../../node_modules/.vite/libs/attest',
  plugins: [],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'craft-ts-attest',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: [],
    reporters: ['default'],
  },
});
