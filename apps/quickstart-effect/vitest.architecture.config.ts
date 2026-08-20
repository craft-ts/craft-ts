/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/quickstart-effect-architecture',
  plugins: [],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'quickstart-effect-architecture',
    globals: true,
    environment: 'node',
    testTimeout: 180_000,
    hookTimeout: 180_000,
    include: ['architecture/**/*.spec.ts'],
  },
});
