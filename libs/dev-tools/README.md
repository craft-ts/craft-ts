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
- the ESLint rules `brand-angular-gen-deps-required` and `brand-angular-deps-match` use the same upward discovery from the analyzed file, bounded by `context.cwd`
- `--config <path>` overrides auto-discovery for the CLI
- `brand-angular-gen-deps-required` can generate a missing `GenDeps_*` alias in the current file
- `brand-angular-deps-match` can autofix an existing `GenDeps_*` alias in the current file

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
      // Adds a Quick Fix in VS Code through the ESLint extension
      'craft-ng/brand-angular-gen-deps-required': 'error',
      'craft-ng/brand-angular-deps-match': 'error',
      'craft-ng/no-angular-inject': 'error',
      'craft-ng/prefer-browser-boundaries': 'error',
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
      // `brand-angular-gen-deps-required` generates missing GenDeps aliases with ESLint autofix
      'craft-ng/brand-angular-gen-deps-required': 'error',
      // `brand-angular-deps-match` refreshes existing GenDeps aliases with ESLint autofix
      'craft-ng/brand-angular-deps-match': 'error',
      'craft-ng/no-angular-inject': 'error',
      'craft-ng/prefer-browser-boundaries': 'error',
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
```

## Editor / AI Refresh

`GenDeps_* = GetDeps<...>` remains a source artifact generated in your `.ts` files.

Use two refresh flows:

- Current file without `GenDeps_*`: trigger the VS Code ESLint Quick Fix on `craft-ng/brand-angular-gen-deps-required`, or run `eslint --fix path/to/file.ts`
- Current file with `GenDeps_*`: trigger the VS Code ESLint Quick Fix on `craft-ng/brand-angular-deps-match`, or run `eslint --fix path/to/file.ts`
- Bulk refresh: run `craft-brand --root <source-root>`

Recommended workflow:

- after changing `inject(...)`, constructor injection, component `imports`, `providers`, or `viewProviders`, run the Quick Fix for the current file
- when doing a larger refactor or upgrading a whole app/lib, run `craft-brand --root <source-root>`
- when a browser API already exists in `@craft-ng/core/browser-boundaries`, enable `craft-ng/prefer-browser-boundaries` to prevent direct access to `window`, `document`, `localStorage`, `console`, and similar globals

Notes:

- the ESLint Quick Fix can generate a missing alias or refresh an existing one, but only for the current file
- the same flow works well for AI agents: file-local updates via `eslint --fix`, bulk updates via `craft-brand --root`
