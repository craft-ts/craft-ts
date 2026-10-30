import { defineConfig } from 'vitest/config';

const workspace = (path: string) => new URL(`../../${path}`, import.meta.url).pathname;

export default defineConfig({
  root: import.meta.dirname,
  // Les packages du workspace se résolvent par leurs sources, même dans un
  // checkout où `npm install` n'a pas encore créé leurs liens.
  resolve: {
    alias: {
      '@craft-ts/playwright-sessions/architecture': workspace('libs/playwright-sessions/src/architecture.ts'),
      '@craft-ts/session-trace': workspace('packages/session-trace/src/index.ts'),
      '@craft-ts/dev-tools/dependency-graph': workspace('libs/dev-tools/src/scripts/dependency-graph.ts'),
      '@craft-ts/dev-tools/architecture-graph': workspace('libs/dev-tools/src/scripts/architecture-graph.ts'),
    },
  },
  test: { environment: 'node', include: ['architecture/**/*.spec.ts'] },
});
