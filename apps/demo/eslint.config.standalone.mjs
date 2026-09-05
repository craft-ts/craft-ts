import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

import craftRules from '@craft-ts/dev-tools/eslint-rules';
import { craftDemoRules } from './craft-eslint-rules.mjs';

export default defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...tseslint.configs.stylistic,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.app.json', './tsconfig.spec.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'craft-ts': craftRules,
    },
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
    // Protocol adapters narrow untyped browser/WebSocket payloads at their
    // boundary; the no-assertion rule remains strict for authored Craft code.
    files: [
      '**/src/app/function-registry.ts',
      '**/src/app/function-registry-entry.ts',
      '**/src/app/function-registry-bridge.ts',
      '**/src/app/log-forwarder.ts',
      '**/src/app/page-actor.ts',
      '**/src/app/template-trace-demo.ts',
      '**/src/demo-typecheck-indicator.ts',
    ],
    rules: {
      'craft-ts/no-type-assertions-in-craft-code': 'off',
    },
  },
  {
    files: ['**/src/app/function-registry.ts'],
    rules: {
      'craft-ts/no-throw': 'off',
    },
  },
  {
    files: ['**/src/app/function-registry.spec.ts'],
    rules: {
      'craft-ts/no-craft-computed-side-effects': 'off',
    },
  },
  {
    files: [
      '**/src/app/function-registry-bridge.ts',
      '**/src/app/query-params.utils.ts',
    ],
    rules: {
      'craft-ts/no-throw': 'off',
    },
  },
  {
    files: ['**/src/app/template-trace-demo.ts'],
    rules: {
    },
  },
  {
    files: [
      '**/src/app/function-registry-bridge.ts',
      '**/src/app/log-forwarder.ts',
    ],
    rules: {
      'craft-ts/no-direct-temporal-globals': 'off',
    },
  },
  {
    files: ['**/*.html'],
    extends: [
    ],
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      'craft-ts/prefer-craft-template-blocks': 'off',
      'craft-ts/no-async-await': 'off',
      'craft-ts/no-throw': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['**/e2e/**/*.ts', '**/playwright.config.ts'],
    rules: {
      'craft-ts/craft-method-name-match': 'off',
      'craft-ts/craft-computed-name-match': 'off',
      'craft-ts/craft-source-name-match': 'off',
      'craft-ts/craft-signal-source-name-match': 'off',
      'craft-ts/craft-component-name-match': 'off',
      'craft-ts/craft-directive-name-match': 'off',
      'craft-ts/no-direct-temporal-globals': 'off',
      'craft-ts/prefer-craft-template-blocks': 'off',
      'craft-ts/no-render-writes': 'off',
      'craft-ts/require-reactive-template-bindings': 'off',
      'craft-ts/prefer-craft-http-transport': 'off',
      'craft-ts/no-imperative-craft-resource-trigger': 'off',
      'craft-ts/require-craft-resource-trigger-yield': 'off',
      'craft-ts/require-yieldable-template-method': 'off',
      'craft-ts/require-craft-method-for-yieldable-callback': 'off',
      'craft-ts/require-yieldable-reactive-read': 'off',
      'craft-ts/no-ephemeral-template-form-state': 'off',
      'craft-ts/template-element-name-unique': 'off',
      'craft-ts/require-primitive-context': 'off',
      'craft-ts/require-primitive-derived-property': 'off',
      'craft-ts/no-async-await': 'off',
      'craft-ts/no-throw': 'off',
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts', '**/e2e/**/*.ts'],
    rules: {
      'craft-ts/prefer-browser-boundaries': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
]);
