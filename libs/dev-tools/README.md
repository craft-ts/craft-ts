# @craft-ng/dev-tools

Development tools for ng-craft: ESLint configs, ESLint rules, and codemods.

## Installation

### Depuis npm (après publication)

```bash
npm install -D @craft-ng/dev-tools
```

## Dev-tools configuration

`craft-brand` and the migrations load a typed project config from
`craft-dev-tools.config.ts`. The legacy `craft-brand.config.ts` format remains
supported.

```ts
import { defineCraftDevToolsConfig } from '@craft-ng/dev-tools';

export default defineCraftDevToolsConfig({
  brand: {
    importAugmentations: [
      {
        match: {
          module: '@ngx-translate/core',
          symbols: ['TranslatePipe'],
          metadata: ['imports'],
        },
        deps: [
          {
            key: 'TranslateService',
            symbol: 'TranslateService',
            typeText: 'TranslateService<unknown>',
          },
        ],
      },
    ],
  },
  serviceMigration: {
    overrides: [
      {
        file: 'src/app/legacy-api.service.ts',
        symbol: 'LegacyApiService',
        name: 'Api',
        scope: 'manuallyProvidedAtRoot',
        strategy: 'craftService',
      },
    ],
  },
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
- `component-test-gen-deps-match` verifies component test helpers use the matching `GenDeps_*` alias

`typeText` supports generic dependency spellings that cannot be inferred from
Angular metadata. Service overrides match by file/module/symbol; later matching
entries take precedence.

Example CLI usage:

```bash
craft-brand --root apps/demo/src
craft-brand --root apps/demo/src --config ./craft-brand.config.ts
```

## Angular services migration

Run services before routes so generated `GenDeps` and route provider names see
the craft helpers:

```bash
craft-migrate --project apps/my-app/tsconfig.app.json --root apps/my-app/src --dry-run
craft-migrate --project apps/my-app/tsconfig.app.json --root apps/my-app/src --write
```

`craft-migrate` runs primitives, services, routes, then Craft components and can emit one combined
report with `--json [path]`. The individual commands remain available for
targeted migrations:

```bash
craft-migrate-primitives --project apps/my-app/tsconfig.app.json --root apps/my-app/src --dry-run
craft-migrate-primitives --project apps/my-app/tsconfig.app.json --root apps/my-app/src --write
craft-migrate-services --project apps/my-app/tsconfig.app.json --root apps/my-app/src --dry-run
craft-migrate-services --project apps/my-app/tsconfig.app.json --root apps/my-app/src --write
craft-migrate-routes --project apps/my-app/tsconfig.app.json --root apps/my-app/src --write
craft-migrate-components --project apps/my-app/tsconfig.app.json --root apps/my-app/src --write
ng build my-app
```

`--write` runs ESLint on touched files by default; use `--no-eslint` only when
the caller owns that step. `--json [path]`, `--check`, and `--fail-on-manual`
support CI and staged migrations. Ambiguous classes are retained and receive an
idempotent `.craft.ts` companion containing `CRAFT_IMPLEMENTATION_REQUIRED`.
The companion uses a valid inferred scope and consumers import its generated
helpers, so a manual service rewrite no longer leaves broken imports behind.

`craft-migrate-primitives` runs before service migration. It converts simple
Angular `signal(...)` calls to the craft `state(...)` primitive and reports
signal-form migration points. Signal forms are intentionally diagnostic-first:
`form(...)` must become `state(..., insertForm(...))`, but field paths and
validators change shape. For async validators, the script reports the
`validateAsync(...) + rxResource(...)` pattern so it can be rewritten as a local
`query(...)` triggered by the field value plus `cAsyncValidate(queryRef, ...)`.

The service migration also:

- preserves method type parameters and avoids property/parameter shadowing
- removes replaced Angular service imports
- converts simple `httpResource(...)` calls to `query(...)` backed by
  `CraftHttpClient.request(...)`
- converts simple writable service methods using `HttpClient.post/put/patch/delete`
  into generator operations backed by `CraftHttpClient`
- when a component already performs a simple `.subscribe()`, creates a
  component-local `mutation(...)` and replaces the subscription trigger with
  `.mutate(...)`; complex subscriptions keep a manual diagnostic so callback
  semantics are not silently moved to a shared service lifecycle
- rewrites simple `chain(resource)` dependencies to `resource.value()` and
  reports only complex chains that require a semantic decision
- disables `@typescript-eslint/explicit-function-return-type` in the nearest
  flat ESLint config, because generated craft callbacks rely on inference

For HTML or Web Component snippets, `craft-migrate-template` reads a file or
stdin and emits a template callback. The browser-safe `template-migration`
subpath exposes the same `migrateTemplateToCraft(...)` function to documentation
sites and other tooling.

## Static Craft dependency graph

`craft-graph` analyzes a TypeScript application without starting it and without
using the runtime registry. It combines the AST with the TypeScript type checker
to represent routes, lazy-loaded components, Craft services, service properties,
component primitives, and source interactions.

```bash
npx craft-graph \
  --project apps/demo/tsconfig.app.json \
  --root . \
  --out craft-dependency-graph \
  --format both
```

This writes `craft-dependency-graph.json` and `craft-dependency-graph.mmd`.
The same command is also available as `npx craft graph`. Use `--format json` or
`--format mermaid` to write only one representation and `--include <text>` to
restrict the analysis to matching source paths.

To get the interactive route explorer, use `--format html`. It embeds the graph
in one standalone file: no server, application runtime, or separate JSON file is
needed. The explorer lets you expand route → component → service/property/
primitive, click any node for its source and relations, and identify services
used by other routes. `--format all` writes JSON, Mermaid, and HTML together.

```bash
npx nx build dev-tools
node dist/libs/dev-tools/src/bin/craft.js graph \
  --project apps/demo/tsconfig.app.json \
  --root . \
  --out craft-dependency-graph.html \
  --format html
```

When running directly from this monorepo, build the package first because the
workspace sources are TypeScript while the package binaries are emitted as
JavaScript:

```bash
npx nx build dev-tools
npx --package ./dist/libs/dev-tools craft graph \
  --project apps/demo/tsconfig.app.json \
  --root . \
  --out craft-dependency-graph \
  --format both
```

## Angular routes migration

`craft-migrate-routes` converts exported `Routes` arrays to `craftRoutes`, wraps
statically resolvable component routes with `craftRoute`, generates or reuses
their `GenDeps_*` type, and adds the file-level DI check.

For new routes, use the `craft` façade rather than the migration command:

```bash
npx craft route add /users/:userId --component src/app/users/user-detail.ts#UserDetailComponent
npx craft route add /users/:userId --create-component users/user-detail
npx craft route add /legacy --redirect-to /users --parent src/app/app.routes.ts#appRoutes
npx craft route split --parent src/app/app.routes.ts#appRoutes --prefix users --target src/app/users/users.routes.ts
```

The same route engine is also published as a native Nx generator and as an
Angular CLI schematic. Both use a virtual workspace tree, so their host CLI
provides project-name resolution and `--dry-run` without direct filesystem
writes:

```bash
# Nx workspace
npx nx g @craft-ng/dev-tools:route /users/:userId \
  --project=my-app \
  --create-component=users/UserDetail

npx nx g @craft-ng/dev-tools:route-split \
  --project=my-app \
  --parent=apps/my-app/src/app/app.routes.ts#appRoutes \
  --prefix=users \
  --target=apps/my-app/src/app/users/users.routes.ts

# Angular CLI workspace
npx ng g @craft-ng/dev-tools:route /users/:userId \
  --project=my-app \
  --create-component=users/UserDetail
```

Without route target options, the generator asks for the target kind. Component
creation then asks for the path relative to the application's `src/app` base,
followed by the component name. Before mutating the virtual tree it prints the
planned `CREATE` and `UPDATE` operations and asks for confirmation. Use `--yes`
for non-interactive automation; Nx/Angular `--dry-run` prints the preview without
asking for confirmation or writing files.

When `--parent` is omitted in an interactive terminal, the generator discovers
every `craftRoutes(...)` collection in the selected Angular project and lists
its exported routes name, source file, and prefix. Select `0` to retain route
path-based auto-detection, or choose a collection number. Scripted calls can
still pass `--parent=path/to/routes.ts#routesName` directly.

Pass `--skip-validation` when another task will run lint and the Angular build.
Otherwise validation runs after the virtual tree has been committed. Nx
workspaces compose the native `@nx/angular:component` generator; Angular CLI
workspaces compose the local `@schematics/angular:component` schematic. New
components use an inline template and inline styles, so the generator creates a
single component `.ts` file rather than separate `.ts`, `.html`, and `.css`
files. Component filenames are always normalized to kebab-case: a component
name such as `DemoPage` produces `demo-page.ts` while retaining the `DemoPage`
class name.

The add command defaults to a lazy routes file per feature and generates
`componentDeps`, `withRetry`, the cascade DI proof, exception assertion,
`.withParent`, and the parent mount assertion. Both commands print their plan
before writing. `--dry-run`, `--yes`, `--json`, `--project`, `--parent`, and
`--feature-file` support scripted usage. After writing, ESLint autofix and the
project TypeScript diagnostics run automatically; failed validation leaves the
changes in place and returns a non-zero exit code with diagnostics.
Component creation uses the local Angular CLI in an `angular.json` workspace,
or the local Nx Angular schematic in an `nx.json` workspace.

Start with a dry run:

```bash
craft-migrate-routes \
  --project apps/my-app/tsconfig.app.json \
  --root apps/my-app/src/app \
  --dry-run
```

Then write the deterministic changes and let the project rules refresh their
generated assertions:

```bash
craft-migrate-routes --project apps/my-app/tsconfig.app.json --root apps/my-app/src/app --write
eslint --fix "apps/my-app/src/**/*.ts"
ng build my-app
```

When the root collection is fully migratable, the routes migration also updates
`app.config.ts` to `craftAppConfig(...)` + `provideCraftRouter(routes.toRoutes())`
and wraps the bootstrap config with `toApplicationConfig(...)`. Collections
containing Angular guards or nested `children` are kept as Angular `Routes`
instead of being half-converted; the CLI emits manual diagnostics and leaves
`app.config.ts` unchanged until the root route tree is craft-compatible.

The migration deliberately reports guards, dynamic paths/redirects, ambiguous
components, inherited providers, and route splits instead of guessing their
business semantics. Use `--fail-on-manual` to make these diagnostics fail the
command, `--json <path>` for a machine-readable report, and `--check` in CI to
reject remaining legacy collections. Lazy collections can declare their mount
context with `--parent-mount <path>` and `--parent-names <name,...>`.

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
      'craft-ng/component-test-gen-deps-match': 'error',
      'craft-ng/no-angular-inject': 'error',
      'craft-ng/prefer-craft-service': 'error',
      'craft-ng/prefer-craft-http-client': 'error',
      'craft-ng/prefer-browser-boundaries': 'error',
      'craft-ng/require-lazy-load-with-retry': 'error',
      'craft-ng/require-cascade-route-di-check': 'error',
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
      'craft-ng/component-test-gen-deps-match': 'error',
      'craft-ng/no-angular-inject': 'error',
      'craft-ng/prefer-craft-service': 'error',
      'craft-ng/prefer-craft-http-client': 'error',
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
- `craft-ng/no-angular-inject` now targets raw Angular `inject()` only
- `craft-ng/prefer-craft-service` forbids authored Angular `@Injectable()` / `@Service()` classes in favor of `craftService(...)`
- `craft-ng/prefer-craft-http-client` forbids Angular `HttpClient` in favor of `CraftHttpClient`
- `craft-ng/prefer-craft-service` and `craft-ng/prefer-craft-http-client` also expose a VS Code Quick Fix suggestion that inserts a temporary local disable comment annotated with the intended migration target
