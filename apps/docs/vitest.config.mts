import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/docs',
  plugins: [],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'docs',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/docs',
      provider: 'v8' as const,
    },
  },
}));
