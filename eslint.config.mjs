import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/out-tsc',
      '**/vitest.config.*.timestamp*',
      '**/.vitepress/cache/**',
      '**/.vitepress/dist/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
  {
    // Architecture graph loaders execute as Node build tooling and intentionally
    // import the Vite plugin from source, as the workspace's Vite configs do.
    files: ['**/architecture/load-graph.ts'],
    rules: {
      '@nx/enforce-module-boundaries': 'off',
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {
      // craft generators may be synchronous while preserving a uniform API.
      'require-yield': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // Test fixtures and browser scenarios deliberately model invalid or
    // partially-initialised values. Their assertions establish the narrowing.
    files: ['**/*.spec.ts', '**/*.test.ts', '**/e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // These public type-level adapters preserve an unconstrained generic at
    // their framework boundary; replacing it with `unknown` would reject the
    // valid callback contracts they adapt.
    files: [
      '**/src/lib/effect-adapter.ts',
      '**/src/lib/effect-checked-di.ts',
      '**/src/lib/effect-state-machine.ts',
      '**/src/lib/server-function-middleware.ts',
      '**/src/lib/i18n.ts',
      '**/src/lib/css-vars.ts',
      '**/src/lib/kinds.ts',
      '**/src/lib/styles.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // These integration adapters narrow values before their assertions or
    // transport hand-off, where a non-null assertion is the explicit contract.
    files: [
      '**/src/lib/commands/attest.ts',
      '**/src/lib/review/server.ts',
      '**/src/lib/visual-app/playwright.ts',
      '**/src/lib/review/template-agent.ts',
      '**/attestation-app/src/review-app.ts',
    ],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
];
