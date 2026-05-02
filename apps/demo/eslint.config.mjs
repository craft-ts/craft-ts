import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';
import craftRules from '../../libs/dev-tools/src/eslint-rules/index.cjs';

export default [
  ...baseConfig,
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  {
    files: ['**/*.ts'],
    plugins: {
      'craft-ng': craftRules,
    },
    rules: {
      'craft-ng/brand-angular-gen-deps-required': 'error',
      'craft-ng/prefer-browser-boundaries': 'error',
      'craft-ng/no-angular-provide-app-initializer': 'error',
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',
      'craft-ng/app-start-registry-match': 'error',
      'craft-ng/brand-angular-deps-match': 'error',
    },
  },
  {
    files: ['**/*.html'],
    // Override or add rules here
    rules: {},
  },
  {
    files: ['src/main.ts', 'apps/demo/src/main.ts'],
    rules: {
      'craft-ng/prefer-browser-boundaries': 'off',
    },
  },
];
