# CLI automation

Writing a typed route by hand means four pieces that must agree: the route, its
`componentDeps`, the `withRetry` wrapper and the DI check. The CLI writes all
four, and the output stays ordinary editable TypeScript.

**Use it for** day-to-day route authoring and for migrating an existing app.
**Then edit the result** — nothing here is generated code you must not touch.

`@craft-ng/dev-tools` provides codemods to migrate an Angular application to
Craft primitives, services, type-safe routes, and selectorless Craft Components.

## Install the migration tool

```shell
npm install @craft-ng/core
npm install --save-dev @craft-ng/dev-tools@beta
```

The migration binaries are available starting with `0.5.1-beta.0` and are
currently published on the `beta` tag. The `latest` version and older beta
versions do not include `craft-migrate`. If the package was installed before
that release, update it and verify the resolved version:

```shell
npm install --save-dev @craft-ng/dev-tools@beta
npm ls @craft-ng/dev-tools
```

Commit or stash the current application changes before running a migration in
write mode.

## Run the complete migration

Preview all migrations first:

```shell
npx craft-migrate \
  --project tsconfig.app.json \
  --root src \
  --dry-run
```

Then apply them:

```shell
npx craft-migrate \
  --project tsconfig.app.json \
  --root src \
  --write
```

`craft-migrate` runs the migrations in the required order:

1. `craft-migrate-primitives`
2. `craft-migrate-services`
3. `craft-migrate-routes`
4. `craft-migrate-components`

The `--write` command also runs ESLint fixes on the touched files. Use
`--no-eslint` only when your project runs this step separately.

## Run a targeted migration

Use an individual codemod when the earlier stages have already been migrated:

```shell
npx craft-migrate-routes \
  --project tsconfig.app.json \
  --root src \
  --dry-run

npx craft-migrate-routes \
  --project tsconfig.app.json \
  --root src \
  --write
npx craft-migrate-components \
  --project tsconfig.app.json \
  --root src \
  --write
```

The route migration converts supported Angular route collections to
`craftRoutes(...)`, adds type-safe route metadata, and reports transformations
that require a manual decision.

For a nested route collection, provide its mount context when it cannot be
inferred safely:

```shell
npx craft-migrate-routes src/app/admin/admin.routes.ts \
  --project tsconfig.app.json \
  --parent-mount admin \
  --parent-names CurrentUser,Permissions \
  --write
```

## Review diagnostics

Write the complete report to a JSON file:

```shell
npx craft-migrate \
  --project tsconfig.app.json \
  --root src \
  --dry-run \
  --json migration-report.json
```

Resolve every manual diagnostic before considering the migration complete.
In particular, verify generated `componentDeps`, inherited route providers,
lazy child collections, and the file-level DI checks.

## Add a CI check

After applying and reviewing the migration, prevent supported legacy patterns
and unresolved manual diagnostics from returning:

```shell
npx craft-migrate \
  --project tsconfig.app.json \
  --root src \
  --check \
  --fail-on-manual
```

Finish with the application's normal lint, type-check, test, and build commands.
See the [complete migration guide](/resources/migration) for the post-codemod checklist.

## Verify the route safety contract

`craft route verify` is the development check for the routing guarantees. It
first type-checks the project as it is, then audits the existing route files:
every component-bearing route must have an active `CanRun` proof (or a
collection-level `ValidateCascadeRoutesFile` proof), and the route ESLint rules
must report no missing exception, pending-component or lazy-retry bookkeeping.
This catches an accidentally commented or omitted `_CanRun...` block even when
the TypeScript baseline itself still compiles.

It then writes temporary fixtures covering route DI, `toProvide` providers,
lazy child checks, route params and inputs, Angular and Craft templates,
pending/error components, lazy loading, guard/resolve/component exceptions,
local recovery and exhaustive handlers. Invalid fixtures are expected to fail,
and their diagnostics are matched with the expected `path`, `pending component`
or `exception component` context.

Add it to the application scripts:

```json
{
  "scripts": {
    "craft:verify-routes": "craft route verify --project tsconfig.app.json"
  }
}
```

Run it locally or in CI:

```shell
npm run craft:verify-routes
```

Fixtures are removed in a `finally` block. Use `--json` for a machine-readable
report, `--root` when the application source root is not detected
automatically, and `--keep-fixtures` only while diagnosing a failed
verification. `--project` and `--tsconfig` are aliases for selecting the app
tsconfig.

This validates compile-time and ESLint bookkeeping guarantees. Runtime
chunk-loading scenarios remain covered by the browser tests.

## See Also

- [Routing setup](/guide/routing/setup) — what the CLI generates for you
- [Angular brand config](/guide/routing/angular-brand-config)
- [Scaling routes](/guide/routing/scaling) — `craft route split`
