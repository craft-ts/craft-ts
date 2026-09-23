import baseConfig from '../../eslint.config.mjs';
import craftRules from '../../libs/dev-tools/src/eslint-rules/index.cjs';
import { craftDemoRules } from '../demo/craft-eslint-rules.mjs';

export default [
  {
    ignores: ['**/.vitepress/cache/**', '**/.vitepress/dist/**'],
  },
  ...baseConfig,
  {
    files: ['**/tests/snippets/**/*.spec.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.spec.json', './tsconfig.app-start-snippets.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'craft-ts': craftRules,
    },
    rules: {
      ...craftDemoRules,
      // Vitest callbacks are async; documented regions stay synchronous.
      'craft-ts/no-async-await': 'off',
      'craft-ts/prefer-browser-boundaries': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Documented examples declare APIs that the smoke test does not call.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
  {
    // TODO(style-only): this project is not migrated to @craft-ts/style yet
    // (lot 5 of the style-only plan). Its migration removes this block; the
    // three rules stay `error` in `recommended`. Until then the rules that
    // read component CSS text keep guarding the legacy `meta.styles`.
    files: ['**/tests/snippets/**/*.ts'],
    plugins: { 'craft-ts': craftRules },
    rules: {
      ...craftRules.configs.legacyComponentCss.rules,
      'craft-ts/no-raw-class': 'off',
      'craft-ts/no-inline-style': 'off',
      'craft-ts/no-component-css': 'off',
    },
  },
  {
    // Snippets are executable documentation and intentionally preserve
    // imperative examples that production Craft modules reject.
    files: ['**/tests/snippets/**/*.ts'],
    rules: {
      'craft-ts/no-craft-use': 'off',
      'craft-ts/prefer-craft-template-blocks': 'off',
      'craft-ts/no-direct-temporal-globals': 'off',
      'craft-ts/require-assert-exhaustive-route-exceptions': 'off',
      'craft-ts/no-type-assertions-in-craft-code': 'off',
      'craft-ts/app-start-registry-match': 'off',
      'craft-ts/no-hardcoded-design-values': 'off',
      'craft-ts/no-craft-service-component-same-file': 'off',
      'craft-ts/craft-component-name-match': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
];
