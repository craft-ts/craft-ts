# @craft-ng/dev-tools

Development tools for ng-craft: ESLint configs, ESLint rules, and codemods.

## Installation

### Depuis npm (après publication)

```bash
npm install -D @craft-ng/dev-tools
```

## Angular Brand Codemod Config

`craft-brand` can load a typed project config from `craft-brand.config.ts`.

```ts
import { defineAngularBrandConfig } from '@craft-ng/dev-tools';

export default defineAngularBrandConfig({
  importAugmentations: [
    {
      match: {
        module: '@ngx-translate/core',
        symbols: ['TranslatePipe'],
        metadata: ['imports'],
      },
      deps: [{ key: 'TranslateService', symbol: 'TranslateService' }],
      missingProvider: [
        { key: 'TranslateService', symbol: 'TranslateService' },
      ],
    },
  ],
});
```

Rule semantics:

- `match.module`: module specifier to match
- `match.symbols`: optional exported symbol names that trigger the rule
- `match.metadata`: `imports` and/or `hostDirectives`
- `deps`: synthetic entries added to generated `GenDeps`
- `missingProvider`: synthetic entries added to generated `missingProvider`

Entry semantics:

- `key`: property name generated in `GenDeps`
- `symbol`: imported type name used in the generated type
- `module`: optional import source override, defaults to `match.module`

Discovery behavior:

- `craft-brand` auto-discovers `craft-brand.config.ts` by walking upward from `--root`
- the ESLint rule `brand-angular-deps-match` uses the same upward discovery from the analyzed file, bounded by `context.cwd`
- `--config <path>` overrides auto-discovery for the CLI

Current scope:

- `TypeScript` config file only
- declarative rules only
- matching only from Angular `imports` and `hostDirectives`
- no arbitrary `typeText` generation and no helper-local `typeof injectX` expressions

Example CLI usage:

```bash
craft-brand --root apps/demo/src
craft-brand --root apps/demo/src --config ./craft-brand.config.ts
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
