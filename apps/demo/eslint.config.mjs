import playwright from 'eslint-plugin-playwright';
import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';
import craftRules from '../../libs/dev-tools/src/eslint-rules/index.cjs';
import { craftDemoRules } from './craft-eslint-rules.mjs';

export default [
  playwright.configs['flat/recommended'],
  ...baseConfig,
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  {
    ignores: ['**/architecture/catalog.ts'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: [
          './tsconfig.app.json',
          './tsconfig.spec.json',
          './tsconfig.e2e.json',
          './tsconfig.architecture.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'craft-ng': craftRules,
    },
    rules: {
      ...craftDemoRules,
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
    // This unit test exercises the JavaScript-facing registry with Angular's
    // standalone computed primitive and does not mount authored Craft code.
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
      // These adapters validate external protocol/URL values and preserve
      // their existing synchronous JavaScript error contracts.
      'craft-ng/no-throw': 'off',
    },
  },
  {
    // This is a diagnostic/bootstrap adapter. It deliberately uses Angular's
    // Injector, but it must still preserve Craft's no-throw contract.
    files: ['**/src/app/template-trace-demo.ts'],
    rules: {
      'craft-ng/no-angular-inject': 'off',
      // These wrappers rethrow Craft's control-flow sentinels so the runtime
      // can handle them at the correct boundary.
      'craft-ng/no-throw': 'off',
    },
  },
  {
    // The application exception boundary must preserve Craft's control-flow
    // sentinels instead of converting them into user-facing exceptions.
    files: ['**/src/app/app.config.ts'],
    rules: {
      'craft-ng/no-throw': 'off',
    },
  },
  {
    // These adapters own infrastructure lifetimes rather than Craft state;
    // their native timer handles are not part of a Craft primitive.
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
    // Playwright files are test-boundary code, not authored Craft modules.
    files: [
      '**/e2e/**/*.ts',
      '**/playwright.config.ts',
      '**/architecture/**/*.ts',
      '**/vitest.architecture.config.ts',
    ],
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
    // Tests may use DOM globals and non-null assertions to express setup and
    // assertions directly; these rules remain enabled for production Craft.
    files: ['**/*.spec.ts', '**/*.test.ts', '**/e2e/**/*.ts'],
    rules: {
      'craft-ng/prefer-browser-boundaries': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
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
