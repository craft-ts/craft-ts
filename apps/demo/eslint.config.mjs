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
      // The demo still contains legacy Angular examples. Keep Craft migration
      // guidance visible without making the application CI-blocking until the
      // examples are migrated incrementally.
      // Functional Craft components carry their inferred dependency metadata.
      'craft-ng/brand-angular-gen-deps-required': 'off',
      'craft-ng/craft-method-name-match': 'warn',
      'craft-ng/craft-computed-name-match': 'warn',
      'craft-ng/craft-source-name-match': 'warn',
      'craft-ng/craft-signal-source-name-match': 'warn',
      'craft-ng/craft-component-name-match': 'warn',
      'craft-ng/craft-directive-name-match': 'warn',
      'craft-ng/no-angular-inject': 'warn',
      'craft-ng/no-angular-signal-forms': 'warn',
      'craft-ng/prefer-craft-template-blocks': 'warn',
      'craft-ng/prefer-craft-reactivity': 'warn',
      'craft-ng/provide-host-name-match-component': 'warn',
      'craft-ng/prefer-craft-http-client': 'error',
      'craft-ng/prefer-craft-http-transport': 'error',
      'craft-ng/prefer-craft-input-output': 'error',
      'craft-ng/prefer-craft-state': 'error',
      'craft-ng/prefer-craft-effect': 'error',
      'craft-ng/no-imperative-craft-resource-trigger': 'error',
      'craft-ng/require-craft-resource-trigger-yield': 'error',
      'craft-ng/prefer-craft-service': 'warn',
      'craft-ng/prefer-browser-boundaries': 'warn',
      'craft-ng/app-start-registry-match': 'warn',
      'craft-ng/global-exception-registry-match': 'warn',
      'craft-ng/brand-angular-deps-match': 'off',
      'craft-ng/require-component-monitoring': 'warn',
      'craft-ng/require-primitive-generator-unwrap': 'warn',
      'craft-ng/require-assert-exhaustive-route-exceptions': 'warn',
      'craft-ng/prefer-craft-router-outlet': 'warn',
      'craft-ng/require-pending-component-di-check': 'warn',
      'craft-ng/require-craft-exception-handler': 'warn',
      'craft-ng/require-exception-component-di-check': 'warn',
      // The top-level tuple expands every SFC contract and hits TS2589.
      'craft-ng/require-child-route-mount-check': 'off',
      'craft-ng/require-lazy-load-with-retry': 'warn',
      // app.routes.ts uses O(1) RouteCheckedDI checks for every SFC instead.
      'craft-ng/require-cascade-route-di-check': 'off',
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
    files: ['**/src/app/function-registry.ts'],
    rules: {
      'craft-ng/prefer-craft-reactivity': 'off',
      'craft-ng/prefer-craft-state': 'off',
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      'craft-ng/prefer-craft-template-blocks': 'off',
      'craft-ng/prefer-craft-reactivity': 'off',
      'craft-ng/prefer-craft-state': 'off',
      'craft-ng/prefer-craft-effect': 'off',
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
