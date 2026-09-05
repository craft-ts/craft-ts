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
    plugins: {
      'craft-ts': craftRules,
    },
    rules: {
      'craft-ts/no-explicit-effect-type': 'error',
      'craft-ts/prefer-inline-effect-insertion': 'error',
      'craft-ts/no-explicit-craft-insertion-type': 'error',
      'craft-ts/no-explicit-craft-template-return-type': 'error',
      'craft-ts/no-craft-primitive-type-assertion': 'error',
      'craft-ts/prefer-insert-deep-yieldable': 'error',
      'craft-ts/no-type-assertions-in-craft-code': 'error',
    },
  },
  {
    // SSR transport, asset and typecheck files adapt untyped Node/browser
    // boundaries; keep the assertion ban strict for the Craft application.
    files: [
      '**/src/production-server.ts',
      '**/src/demo-typecheck-indicator.ts',
    ],
    rules: {
      'craft-ts/no-type-assertions-in-craft-code': 'off',
    },
  },
  {
    // These provider-context rules belong at the route/config boundary. The
    // SSR pages intentionally contain renderer-specific examples that are not
    // the subject of this app-level architecture check.
    files: ['**/src/app/app.routes.ts', '**/src/app/app.config.ts'],
    plugins: {
      'craft-ts': craftRules,
    },
    rules: {
      'craft-ts/no-manual-route-provider-list': 'error',
      'craft-ts/no-widened-route-provider-context': 'error',
      'craft-ts/require-lazy-load-with-retry': 'error',
      '@nx/enforce-module-boundaries': 'off',
    },
  },
  {
    files: ['**/src/**/*.spec.ts', '**/src/**/*.test.ts'],
    rules: {
      'craft-ts/no-throw': 'off',
      'craft-ts/no-async-await': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['**/vite.config.ts', '**/vitest.config.ts'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
    },
  },
  {
    // The SSR entry deliberately consumes the server-function demo's shared
    // facade and server registry to prove that one Node process can serve both
    // concerns. These are explicit integration boundaries, not application
    // code dependencies.
    files: [
      '**/src/server.ts',
      '**/src/production-server.ts',
      '**/src/app/pages/overview-page.ts',
      '**/vite.ssr.config.ts',
    ],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
    },
  },
];
