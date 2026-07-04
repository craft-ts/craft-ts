# Automation

`@craft-ng/dev-tools` provides codemods to migrate an Angular application to
Craft primitives, services, and type-safe routes.

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

The `--write` command also runs ESLint fixes on the touched files. Use
`--no-eslint` only when your project runs this step separately.

## Run only the route migration

Use the route codemod directly when primitives and services have already been
migrated:

```shell
npx craft-migrate-routes \
  --project tsconfig.app.json \
  --root src \
  --dry-run

npx craft-migrate-routes \
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
See the [complete migration guide](/migration) for the post-codemod checklist.
