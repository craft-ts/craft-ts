import baseConfig from '../../../eslint.config.mjs';
import craftRules from '../../dev-tools/src/eslint-rules/index.cjs';

export default [
  { ignores: ['**/architecture/catalog.ts'] },
  ...baseConfig,
  {
    files: ['**/src/**/*.ts'],
    plugins: {
      'craft-ts': craftRules,
    },
    rules: {
      ...craftRules.configs.security.rules,
    },
  },
  {
    files: ['**/src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'craft-ts': craftRules,
    },
    rules: {
      ...craftRules.configs.recommended.rules,
      'craft-ts/no-effect-import-in-frontend': 'error',
      // A size violation must fail lint: this application is validated through
      // the same gate as every other consumer of the Craft recommendations.
      'craft-ts/max-craft-component-lines': 'error',
    },
  },
  {
    // The review surface needs DOM operations that the deliberately narrow
    // BrowserDocument DSL does not expose. Keep that host access isolated.
    files: ['**/src/browser-adapter.ts'],
    rules: {
      'craft-ts/prefer-browser-boundaries': 'off',
    },
  },
  {
    // These supporting review projections intentionally prioritise a compact
    // inspector template over a deep-yieldable presentation adapter.
    files: ['**/src/application-overview.ts', '**/src/template-review-group.ts'],
    rules: {
      'craft-ts/prefer-deep-yieldable-for-item': 'off',
    },
  },
  {
    // The filter count is derived from a query-parameter primitive. Its
    // insertion surface does not expose a derived-property slot, so keeping
    // the projection beside the filter service is the narrowest ownership.
    files: ['**/src/review-filters.service.ts'],
    rules: {
      'craft-ts/require-primitive-derived-property': 'off',
    },
  },
];
