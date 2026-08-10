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
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'craft-ng': craftRules,
    },
    rules: {
      'craft-ng/craft-method-name-match': 'warn',
      'craft-ng/craft-computed-name-match': 'warn',
      'craft-ng/craft-source-name-match': 'warn',
      'craft-ng/craft-signal-source-name-match': 'warn',
      'craft-ng/craft-component-name-match': 'warn',
      'craft-ng/craft-directive-name-match': 'warn',
      'craft-ng/no-angular-inject': 'error',
      'craft-ng/no-angular-signal-forms': 'error',
      'craft-ng/no-direct-temporal-globals': 'error',
      'craft-ng/prefer-craft-template-blocks': 'error',
      'craft-ng/prefer-craft-computed': 'error',
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
      'craft-ng/require-component-monitoring': 'warn',
      'craft-ng/require-primitive-generator-unwrap': 'warn',
      'craft-ng/require-yieldable-template-method': 'error',
      'craft-ng/no-ephemeral-template-form-state': 'error',
      'craft-ng/template-element-name-unique': 'error',
      'craft-ng/require-primitive-context': 'error',
      'craft-ng/require-primitive-derived-property': 'error',
      'craft-ng/no-async-await': 'error',
      'craft-ng/no-throw': 'error',
      'craft-ng/require-assert-exhaustive-route-exceptions': 'warn',
      'craft-ng/prefer-craft-router-outlet': 'warn',
      'craft-ng/require-pending-component-di-check': 'warn',
      'craft-ng/require-craft-exception-handler': 'warn',
      'craft-ng/require-exception-component-di-check': 'warn',
      // Conflicts with the demo's per-route RouteCheckedDI strategy: the
      // top-level tuple expands every SFC contract and hits TS2589.
      'craft-ng/require-child-route-mount-check': 'off',
      'craft-ng/require-lazy-load-with-retry': 'warn',
      // Conflicts with the demo's O(1) RouteCheckedDI checks: adding the
      // aggregate cascade proof makes the large app route file hit TS2589.
      'craft-ng/require-cascade-route-di-check': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    files: ['**/src/app/function-registry.ts'],
    rules: {
      'craft-ng/prefer-craft-reactivity': 'off',
      'craft-ng/prefer-craft-state': 'off',
      // The registry is a JavaScript-facing diagnostic boundary, not a Craft
      // primitive. Its public API reports malformed calls by throwing.
      'craft-ng/no-throw': 'off',
    },
  },
  {
    files: [
      '**/src/app/function-registry-bridge.ts',
      '**/src/app/query-params.utils.ts',
    ],
    rules: {
      // These adapters validate external protocol/URL values and preserve
      // their existing synchronous JavaScript error contracts.
      'craft-ng/no-throw': 'off',
    },
  },
  {
    // Unit tests use Vitest and may legitimately use async/await. Keep the
    // Playwright rules enabled for e2e specs outside src/.
    files: ['**/src/**/*.spec.ts', '**/src/**/*.test.ts'],
    rules: {
      'craft-ng/prefer-craft-template-blocks': 'off',
      'craft-ng/prefer-craft-reactivity': 'off',
      'craft-ng/prefer-craft-state': 'off',
      'craft-ng/prefer-craft-effect': 'off',
      'craft-ng/no-async-await': 'off',
      'craft-ng/no-throw': 'off',
      'playwright/no-standalone-expect': 'off',
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
