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
      // This workspace app is a collection of migration/primitive examples;
      // several intentionally demonstrate the APIs these production rules
      // recommend replacing.
      'craft-ts/no-async-await': 'off',
      'craft-ts/no-ephemeral-template-form-state': 'off',
      'craft-ts/prefer-craft-template-blocks': 'off',
      'craft-ts/prefer-direct-yieldable-callback': 'off',
      'craft-ts/require-effect-adapters': 'off',
      'craft-ts/require-focus-visible': 'off',
      'craft-ts/require-primitive-derived-property': 'off',
      'craft-ts/require-reduced-motion': 'off',
      'craft-ts/require-yieldable-reactive-read': 'off',
      'craft-ts/prefer-route-query-params-for-filter-state': 'off',
    },
  },
  {
    // These demos intentionally showcase lower-level primitive APIs and
    // dynamic lazy imports; the production-only rules are too strict here.
    files: ['**/src/client/app.routes.ts'],
    rules: {
      'craft-ts/no-async-await': 'off',
    },
  },
  {
    files: ['**/src/client/app-shell.ts'],
    rules: {
      'craft-ts/require-focus-visible': 'off',
      'craft-ts/require-reduced-motion': 'off',
    },
  },
  {
    files: [
      '**/src/client/effect-server-middleware-demo.ts',
      '**/src/client/portable-server-function-demo.ts',
    ],
    rules: {
      'craft-ts/require-effect-adapters': 'off',
      'craft-ts/require-primitive-derived-property': 'off',
      'craft-ts/require-yieldable-reactive-read': 'off',
      'craft-ts/prefer-craft-template-blocks': 'off',
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
    // This example wraps portableServerFunction, which has the same client
    // contract but is deliberately outside the serverFunction-only matcher.
    files: [
      '**/effect-middleware-list.fn-client.ts',
      '**/portable-list.fn-client.ts',
    ],
    rules: {
      'craft-ts/server-function-client-match': 'off',
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
