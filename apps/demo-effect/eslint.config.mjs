import baseConfig from '../../eslint.config.mjs';
import craftRules from '../../libs/dev-tools/src/eslint-rules/index.cjs';
import { craftDemoRules } from '../demo/craft-eslint-rules.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/src/**/*.ts'],
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
      'craft-ts/require-effect-adapters': 'error',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@nx/enforce-module-boundaries': 'off',
    },
  },
  {
    // These Vite configs import local workspace tooling directly; Nx's
    // boundary fixer cannot resolve the source-only package aliases here.
    files: ['**/vite.config.ts', '**/vitest.config.ts'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
    },
  },
  {
    // Tests are a boundary and may use async/await, throws, and direct DOM
    // assertions without the production Craft constraints.
    files: ['**/src/**/*.spec.ts', '**/src/**/*.test.ts'],
    rules: {
      'craft-ts/prefer-craft-template-blocks': 'off',
      'craft-ts/no-async-await': 'off',
      'craft-ts/no-throw': 'off',
      'craft-ts/prefer-browser-boundaries': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
];
