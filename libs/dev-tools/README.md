# @craft-ng/dev-tools

Development tools for ng-craft: ESLint configs, ESLint rules, and codemods.

## Installation

### Depuis npm (après publication)

```bash
npm install -D @craft-ng/dev-tools
```

```bash
import craftRules from '@craft-ng/dev-tools/eslint-rules';

export default [
  {
    plugins: {
      'craft-ng': craftRules
    },
    rules: {
      'craft-ng/brand-angular-deps-match': 'error',
      'craft-ng/no-angular-inject': 'error',
      'craft-ng/no-direct-angular-class-export': 'error',
    }
  }
];
```

```bash
const craftRules = require('@craft-ng/dev-tools/eslint-rules');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    plugins: {
      'craft-ng': craftRules,
    },
    rules: {
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
      '@typescript-eslint/consistent-type-definitions': 'off',
      // Ajoutez vos règles craft-ng ici
      'craft-ng/brand-angular-deps-match': 'error',
      'craft-ng/no-angular-inject': 'error',
      'craft-ng/no-direct-angular-class-export': 'error',
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
```
