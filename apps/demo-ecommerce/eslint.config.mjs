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
      // Effect server adapters run outside Craft's browser temporal/random
      // runtime. Keep the replay boundary checks scoped to Craft modules.
      'craft-ts/no-direct-temporal-globals': 'off',
      'craft-ts/no-direct-random-globals': 'off',
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
    files: ['**/src/client/**/*.ts'],
    plugins: { 'craft-ts': craftRules },
    rules: {
      'craft-ts/prefer-craft-router-link': 'error',
      // Le rejeu et la reprise pilotent l'horloge : la vitrine ne lit jamais le
      // temps ni ne programme de tâche en dehors du runtime temporel.
      'craft-ts/no-direct-temporal-globals': 'error',
      'craft-ts/no-direct-random-globals': 'error',
    },
  },
  {
    ...craftRules.configs.e2e,
    files: ['e2e/**/*.spec.ts'],
    // La reprise fonctionnelle pilote le dashboard elle-même, sans historique.
    ignores: ['e2e/resume.spec.ts'],
    rules: {
      ...craftRules.configs.e2e.rules,
      'craft-ts/e2e-session-contract': ['error', { fixtureFiles: [`${import.meta.dirname}/e2e/fixtures.ts`] }],
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
