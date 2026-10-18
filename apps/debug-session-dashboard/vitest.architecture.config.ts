/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: "../../node_modules/.vite/debug-session-dashboard-architecture",
  plugins: [],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: "debug-session-dashboard-architecture",
    watch: false,
    globals: true,
    environment: 'node',
    testTimeout: 180_000,
    hookTimeout: 180_000,
    include: ['architecture/**/*.spec.ts'],
  },
}));
