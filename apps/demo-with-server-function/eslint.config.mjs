import baseConfig from '../../eslint.config.mjs';
import craftRules from '../../libs/dev-tools/src/eslint-rules/index.cjs';

export default [
  { ignores: ['**/architecture/catalog.ts'] },
  ...baseConfig,
  {
    files: ['**/src/client/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'craft-ts': craftRules,
    },
    rules: {
      ...craftRules.configs.effect.rules,
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    files: ['**/*.fn-client.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'craft-ts': craftRules,
    },
    rules: {
      'craft-ts/server-function-client-match': 'error',
    },
  },
  {
    // This Vite config is a Node-side entry point and imports source-only
    // workspace aliases while Nx is evaluating the configuration.
    files: ['**/vite.config.ts', '**/vitest.config.ts'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
    },
  },
  {
    // The demo's Node server entry is loaded directly by Vite's config. It
    // intentionally imports source libraries by relative path because Nx
    // aliases are unavailable while Vite evaluates its Node config.
    files: [
      '**/src/server/**/*.ts',
      '**/src/users/**/*.ts',
    ],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
    },
  },
  {
    // Integration tests are boundary code and may use async/await and direct
    // assertions without the production Craft constraints.
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      'craft-ts/prefer-craft-template-blocks': 'off',
      'craft-ts/no-async-await': 'off',
      'craft-ts/no-throw': 'off',
      'craft-ts/prefer-craft-http-transport': 'off',
      'craft-ts/prefer-browser-boundaries': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
];
