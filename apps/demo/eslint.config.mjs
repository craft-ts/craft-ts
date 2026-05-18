import playwright from 'eslint-plugin-playwright';
import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';
import craftRules from '../../libs/dev-tools/src/eslint-rules/index.cjs';

export default [
  playwright.configs['flat/recommended'],
  ...baseConfig,
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  {
    files: ['**/*.ts'],
    plugins: {
      'craft-ng': craftRules,
    },
    rules: {
      'craft-ng/brand-angular-gen-deps-required': 'error',
      'craft-ng/craft-method-name-match': 'error',
      'craft-ng/no-angular-inject': 'error',
      'craft-ng/no-angular-signal-forms': 'error',
      'craft-ng/provide-host-name-match-component': 'error',
      'craft-ng/prefer-craft-http-client': 'error',
      'craft-ng/prefer-craft-service': 'error',
      'craft-ng/prefer-browser-boundaries': 'error',
      'craft-ng/app-start-registry-match': 'error',
      'craft-ng/brand-angular-deps-match': 'error',
      'craft-ng/require-component-monitoring': 'error',
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    files: ['**/*.html'],
    // Override or add rules here
    rules: {},
  },
  {
    files: ['**/*.ts', '**/*.js'],
    // Override or add rules here
    rules: {},
  },
];
