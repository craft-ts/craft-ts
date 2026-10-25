import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Tests run against the shared module's sources, without building it first.
  resolve: { alias: { '@craft-ts/session-trace': new URL('../session-trace/src/index.ts', import.meta.url).pathname } },
  test: {
    name: 'log-mcp',
    root: import.meta.dirname,
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    watch: false,
  },
});
