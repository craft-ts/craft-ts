/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: path.dirname(fileURLToPath(import.meta.url)),
  cacheDir: '../../node_modules/.vite/libs/graph-mcp',
  plugins: [],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'graph-mcp',
    globals: true,
    environment: 'node',
    testTimeout: 60_000,
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
  },
});
