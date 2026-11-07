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
    // The workspace paths reach the sources, not the specs: these two are
    // what a spec analyses a real app with and reads its recorded sessions.
    alias: {
      '@craft-ts/dev-tools/dependency-graph': path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dev-tools/src/scripts/dependency-graph.ts'),
      '@craft-ts/session-trace': path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../packages/session-trace/src/index.ts'),
    },
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
