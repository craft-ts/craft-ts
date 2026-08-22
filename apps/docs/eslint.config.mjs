import nx from '@nx/eslint-plugin';
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
        project: ['./tsconfig.spec.json'],
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
    // Snippets are executable documentation and intentionally preserve
    // imperative examples that production Craft modules reject.
    files: ['**/tests/snippets/**/*.ts'],
    rules: {
      'craft-ts/no-craft-use': 'off',
      'craft-ts/prefer-craft-template-blocks': 'off',
      'craft-ts/no-direct-temporal-globals': 'off',
      'craft-ts/require-assert-exhaustive-route-exceptions': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
];
