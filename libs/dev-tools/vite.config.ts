/// <reference types='vitest' />
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/libs/dev-tools',
  plugins: [],
  resolve: {
    tsconfigPaths: true,
  },
  // Uncomment this if you are using workers.
  // worker: {
  // },
  test: {
    name: 'dev-tools',
    watch: false,
    globals: true,
    environment: 'node',
    testTimeout: 30_000,
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/libs/dev-tools',
      provider: 'v8' as const,
    },
  },
}));
