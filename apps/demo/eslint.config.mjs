import playwright from 'eslint-plugin-playwright';
import baseConfig from '../../eslint.config.mjs';
import craftRules from '../../libs/dev-tools/src/eslint-rules/index.cjs';
import { craftDemoRules } from './craft-eslint-rules.mjs';

const craftSourceFiles = ['**/src/**/*.ts'];
const testFiles = ['**/*.spec.ts', '**/*.test.ts', '**/e2e/**/*.ts'];
const unitTestFiles = ['**/src/**/*.spec.ts', '**/src/**/*.test.ts'];

export default [
  playwright.configs['flat/recommended'],
  ...baseConfig,
  {
    ignores: ['**/architecture/catalog.ts'],
  },
  {
    // Craft rules describe authored application code. Specs, architecture
    // proofs, and Playwright tests are separate executable boundaries.
    files: craftSourceFiles,
    ignores: ['**/*.spec.ts', '**/*.test.ts'],
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
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    // These boundaries intentionally expose synchronous JavaScript-style
    // error contracts instead of the application's no-throw contract.
    files: [
      '**/src/app/app.config.ts',
      '**/src/app/function-registry.ts',
      '**/src/app/function-registry-entry.ts',
      '**/src/app/function-registry-bridge.ts',
      '**/src/app/page-actor.ts',
      '**/src/app/query-params.utils.ts',
      '**/src/app/template-trace-demo.ts',
    ],
    rules: {
      'craft-ts/no-throw': 'off',
      // These entry points are synchronous adapters around Craft generators.
      'craft-ts/no-craft-use': 'off',
    },
  },
  {
    files: [
      '**/src/app/function-registry-bridge.ts',
      '**/src/app/page-actor.ts',
      '**/src/app/query-params.utils.ts',
    ],
    rules: {
      // These adapters validate external protocol/URL values and may use
      // async/await at their infrastructure boundary.
      'craft-ts/no-async-await': 'off',
    },
  },
  {
    // These adapters own infrastructure lifetimes rather than Craft state;
    // their native timer handles are not part of a Craft primitive.
    files: [
      '**/src/app/function-registry-bridge.ts',
      '**/src/app/log-forwarder.ts',
      '**/src/app/function-registry-entry.ts',
    ],
    rules: {
      'craft-ts/no-direct-temporal-globals': 'off',
      'craft-ts/no-craft-use': 'off',
    },
  },
  {
    // Vite/Vitest config files are Node tooling boundaries and intentionally
    // import the shared workspace plugin through a relative path.
    files: ['**/vite.config.ts', '**/vitest.config.ts'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
    },
  },
  {
    // Tests may use DOM globals and non-null assertions to express setup and
    // assertions directly; these rules remain enabled for production Craft.
    files: testFiles,
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // Vitest specs use expect in shared setup helpers; this is not Playwright
    // test code and should not be checked by Playwright's test-boundary rule.
    files: unitTestFiles,
    rules: {
      'playwright/no-standalone-expect': 'off',
    },
  },
];
