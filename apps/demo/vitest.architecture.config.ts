/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/demo-architecture',
  plugins: [],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'demo-architecture',
    watch: false,
    globals: true,
    environment: 'node',
    testTimeout: 180_000,
    hookTimeout: 180_000,
    include: ['architecture/**/*.spec.ts'],
    reporters: ['default'],
  },
}));
