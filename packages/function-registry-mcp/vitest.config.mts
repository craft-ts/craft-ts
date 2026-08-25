import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'function-registry-mcp',
    root: import.meta.dirname,
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    watch: false,
  },
});
