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
      // Keep the standalone release config aligned with the workspace demo
      // config. Craft generator functions may intentionally return without
      // yielding when they only delegate to another generator.
      'require-yield': 'off',
      // The workspace demo permits type aliases for unions and mapped types.
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/consistent-generic-constructors': 'off',
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
    files: ['**/src/app/function-registry.ts'],
    rules: {
      'craft-ng/prefer-craft-reactivity': 'off',
      'craft-ng/prefer-craft-state': 'off',
      'craft-ng/no-throw': 'off',
    },
  },
  {
    files: ['**/src/app/function-registry.spec.ts'],
    rules: {
      'craft-ng/prefer-craft-computed': 'off',
      'craft-ng/no-craft-computed-side-effects': 'off',
    },
  },
  {
    files: [
      '**/src/app/function-registry-bridge.ts',
      '**/src/app/query-params.utils.ts',
    ],
    rules: {
      'craft-ng/no-throw': 'off',
    },
  },
  {
    files: ['**/src/app/template-trace-demo.ts'],
    rules: {
      'craft-ng/no-angular-inject': 'off',
    },
  },
  {
    files: [
      '**/src/app/function-registry-bridge.ts',
      '**/src/app/log-forwarder.ts',
      '**/src/app/examples/primitives/pixel-art-matrix/long-press.directive.ts',
    ],
    rules: {
      'craft-ng/no-direct-temporal-globals': 'off',
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
  {
    files: ['**/e2e/**/*.ts', '**/playwright.config.ts'],
    rules: {
      'craft-ng/craft-method-name-match': 'off',
      'craft-ng/craft-computed-name-match': 'off',
      'craft-ng/craft-source-name-match': 'off',
      'craft-ng/craft-signal-source-name-match': 'off',
      'craft-ng/craft-component-name-match': 'off',
      'craft-ng/craft-directive-name-match': 'off',
      'craft-ng/no-angular-inject': 'off',
      'craft-ng/no-angular-signal-forms': 'off',
      'craft-ng/no-direct-temporal-globals': 'off',
      'craft-ng/prefer-craft-template-blocks': 'off',
      'craft-ng/no-render-writes': 'off',
      'craft-ng/require-reactive-template-bindings': 'off',
      'craft-ng/prefer-craft-computed': 'off',
      'craft-ng/prefer-craft-reactivity': 'off',
      'craft-ng/prefer-craft-http-client': 'off',
      'craft-ng/prefer-craft-http-transport': 'off',
      'craft-ng/prefer-craft-input-output': 'off',
      'craft-ng/prefer-craft-state': 'off',
      'craft-ng/prefer-craft-effect': 'off',
      'craft-ng/no-imperative-craft-resource-trigger': 'off',
      'craft-ng/require-craft-resource-trigger-yield': 'off',
      'craft-ng/require-yieldable-template-method': 'off',
      'craft-ng/require-craft-method-for-yieldable-callback': 'off',
      'craft-ng/require-yieldable-reactive-read': 'off',
      'craft-ng/no-ephemeral-template-form-state': 'off',
      'craft-ng/template-element-name-unique': 'off',
      'craft-ng/require-primitive-context': 'off',
      'craft-ng/require-primitive-derived-property': 'off',
      'craft-ng/no-async-await': 'off',
      'craft-ng/no-throw': 'off',
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts', '**/e2e/**/*.ts'],
    rules: {
      'craft-ng/prefer-browser-boundaries': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
]);
