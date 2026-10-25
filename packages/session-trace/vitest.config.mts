import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'session-trace',
    root: import.meta.dirname,
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    watch: false,
  },
});
