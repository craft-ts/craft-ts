import baseConfig from '../../../eslint.config.mjs';
import craftRules from '../../dev-tools/src/eslint-rules/index.cjs';

export default [
  { ignores: ['**/architecture/catalog.ts'] },
  ...baseConfig,
  {
    files: ['**/src/**/*.ts'],
    plugins: {
      'craft-ts': craftRules,
    },
    rules: {
      ...craftRules.configs.security.rules,
    },
  },
  {
    files: ['**/src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'craft-ts': craftRules,
    },
    rules: {
      ...craftRules.configs.recommended.rules,
      'craft-ts/no-effect-import-in-frontend': 'error',
    },
  },
  {
    // The review surface needs DOM operations that the deliberately narrow
    // BrowserDocument DSL does not expose. Keep that host access isolated.
    files: ['**/src/browser-adapter.ts'],
    rules: {
      'craft-ts/prefer-browser-boundaries': 'off',
    },
  },
];
