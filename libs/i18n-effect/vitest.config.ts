/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/i18n-effect',
  resolve: {
    tsconfigPaths: true,
    alias: { '@craft-ts/i18n': resolve(import.meta.dirname, '../i18n/src/index.ts') },
  },
  test: {
    name: 'craft-ts-i18n-effect',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
