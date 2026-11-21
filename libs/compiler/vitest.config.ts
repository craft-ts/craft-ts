import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@craft-ts/component/compiler-runtime',
        replacement: resolve('libs/component/src/compiler-runtime.ts'),
      },
      ...['component', 'core', 'style'].map((name) => ({
        find: '@craft-ts/' + name,
        replacement: resolve('libs/' + name + '/src/index.ts'),
      })),
    ],
  },
  test: { environment: 'node', include: ['libs/compiler/src/**/*.spec.ts'] },
});
