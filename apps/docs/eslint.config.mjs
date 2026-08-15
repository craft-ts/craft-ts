import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';
import craftRules from '../../libs/dev-tools/src/eslint-rules/index.cjs';
import { craftDemoRules } from '../demo/craft-eslint-rules.mjs';

export default [
  {
    ignores: ['**/.vitepress/cache/**', '**/.vitepress/dist/**'],
  },
  ...baseConfig,
  ...nx.configs['flat/angular'],
  {
    files: ['**/tests/snippets/**/*.spec.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.spec.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'craft-ng': craftRules,
    },
    rules: {
      ...craftDemoRules,
      // Vitest callbacks are async; documented regions stay synchronous.
      'craft-ng/no-async-await': 'off',
      'craft-ng/prefer-browser-boundaries': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Documented examples declare APIs that the smoke test does not call.
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
];
