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
    // This legacy review surface keeps its template-local derivations together
    // for the frozen-document workflow. The smaller components follow the
    // stricter rules above; this exception avoids a 3,000-line mechanical
    // rewrite with no runtime benefit.
    files: ['**/src/review-app.ts'],
    rules: {
      'craft-ts/prefer-craft-template-blocks': 'off',
      'craft-ts/no-ephemeral-template-form-state': 'off',
      'craft-ts/require-reactive-template-bindings': 'off',
      'craft-ts/max-craft-component-lines': 'off',
      'craft-ts/no-type-assertions-in-craft-code': 'off',
      'craft-ts/no-type-assertions-in-template': 'off',
      'craft-ts/require-primitive-generator-unwrap': 'off',
      'craft-ts/no-reused-primitive-method': 'off',
      'craft-ts/no-direct-temporal-globals': 'off',
      'craft-ts/prefer-deep-yieldable-for-item': 'off',
      'craft-ts/no-craft-computed-side-effects': 'off',
      'craft-ts/prefer-direct-yieldable-callback': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
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
