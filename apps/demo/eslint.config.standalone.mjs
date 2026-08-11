import eslint from '@eslint/js';
import angular from 'angular-eslint';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

import craftRules from '@craft-ng/dev-tools/eslint-rules';
import { craftDemoRules } from './craft-eslint-rules.mjs';

export default defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.app.json', './tsconfig.spec.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'craft-ng': craftRules,
    },
    processor: angular.processInlineTemplates,
    rules: {
      ...craftDemoRules,
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [
      angular.configs.templateRecommended,
      angular.configs.templateAccessibility,
    ],
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      'craft-ng/prefer-craft-template-blocks': 'off',
      'craft-ng/prefer-craft-reactivity': 'off',
      'craft-ng/prefer-craft-state': 'off',
      'craft-ng/prefer-craft-effect': 'off',
      'craft-ng/no-async-await': 'off',
      'craft-ng/no-throw': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
]);
