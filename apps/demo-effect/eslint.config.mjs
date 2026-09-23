import baseConfig from '../../eslint.config.mjs';
import craftRules from '../../libs/dev-tools/src/eslint-rules/index.cjs';

export default [
  { ignores: ['**/architecture/catalog.ts'] },
  ...baseConfig,
  {
    // Le préréglage sécurité couvre TOUT le code source, serveur compris :
    // c'est là que vivent les registres de server functions, les adapters et
    // la lecture des en-têtes.
    files: ['**/src/**/*.ts'],
    ignores: ['**/src/**/*.spec.ts', '**/src/**/*.test.ts'],
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
        project: ['./tsconfig.app.json', './tsconfig.spec.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'craft-ts': craftRules,
    },
    rules: {
      ...craftRules.configs.effect.rules,
      '@typescript-eslint/no-empty-object-type': 'off',
      '@nx/enforce-module-boundaries': 'off',
    },
  },
  {
    // TODO(style-only): this project is not migrated to @craft-ts/style yet
    // (lot 5 of the style-only plan). Its migration removes this block; the
    // three rules stay `error` in `recommended`. Until then the rules that
    // read component CSS text keep guarding the legacy `meta.styles`.
    files: ['**/src/**/*.ts'],
    plugins: { 'craft-ts': craftRules },
    rules: {
      ...craftRules.configs.legacyComponentCss.rules,
      'craft-ts/no-raw-class': 'off',
      'craft-ts/no-inline-style': 'off',
      'craft-ts/no-component-css': 'off',
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
    // Effect demos intentionally keep local state and list reads visible so
    // the examples can contrast those primitives with the URL-backed form.
    files: ['**/src/app/examples/effect/**/*.ts'],
    rules: {
      'craft-ts/prefer-route-query-params-for-filter-state': 'off',
      'craft-ts/prefer-deep-yieldable-for-item': 'off',
      'craft-ts/no-hardcoded-design-values': 'off',
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
