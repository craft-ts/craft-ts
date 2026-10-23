import baseConfig from '../../eslint.config.mjs';
import craftRules from '../../libs/dev-tools/src/eslint-rules/index.cjs';

export default [
  ...baseConfig,
  {
    files: ['**/src/server/**/*.ts', '**/src/shared/**/*.ts'],
    ignores: ['**/src/**/*.spec.ts', '**/src/**/*.test.ts'],
    plugins: { 'craft-ts': craftRules },
    rules: { ...craftRules.configs.security.rules },
  },
  {
    files: ['**/src/server/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'craft-ts': craftRules },
    rules: {
      ...craftRules.configs.effect.rules,
      // Effect's Node adapter is the boundary where native Promise, throws, and
      // runtime-validated assertions are intentionally contained.
      'craft-ts/no-async-await': 'off',
      'craft-ts/no-type-assertions-in-craft-code': 'off',
      'craft-ts/no-throw': 'off',
      'craft-ts/prefer-browser-boundaries': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@nx/enforce-module-boundaries': 'off',
    },
  },
  {
    files: ['**/src/**/*.spec.ts', '**/src/**/*.test.ts'],
    rules: {
      'craft-ts/prefer-craft-template-blocks': 'off',
      'craft-ts/no-async-await': 'off',
      'craft-ts/no-throw': 'off',
      'craft-ts/prefer-browser-boundaries': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['**/vite.config.ts', '**/vitest.config.ts'],
    rules: { '@nx/enforce-module-boundaries': 'off' },
  },
];
