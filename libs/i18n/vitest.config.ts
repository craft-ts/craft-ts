/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/i18n',
  test: {
    name: 'craft-ts-i18n',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
