import baseConfig from '../../eslint.config.mjs';
import craftRules from '../../libs/dev-tools/src/eslint-rules/index.cjs';

export default [
  { ignores: ['**/architecture/catalog.ts'] },
  ...baseConfig,
  {
    // These provider-context rules belong at the route/config boundary. The
    // SSR pages intentionally contain renderer-specific examples that are not
    // the subject of this app-level architecture check.
    files: ['**/src/app/app.routes.ts', '**/src/app/app.config.ts'],
    plugins: {
      'craft-ts': craftRules,
    },
    rules: {
      'craft-ts/no-manual-route-provider-list': 'error',
      'craft-ts/no-widened-route-provider-context': 'error',
      'craft-ts/require-lazy-load-with-retry': 'error',
      '@nx/enforce-module-boundaries': 'off',
    },
  },
  {
    files: ['**/src/**/*.spec.ts', '**/src/**/*.test.ts'],
    rules: {
      'craft-ts/no-throw': 'off',
      'craft-ts/no-async-await': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['**/vite.config.ts', '**/vitest.config.ts'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
    },
  },
];
