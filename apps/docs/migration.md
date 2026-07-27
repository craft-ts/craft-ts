# Migrating an Angular application

`craft-migrate` runs the Craft NG codemods in their required order:

1. Angular signals and primitive migration points
2. Angular services and their consumers
3. Angular route collections and type-safe DI checks

The migration is intentionally conservative. Deterministic transformations are
written automatically; code requiring a business or lifecycle decision is
reported as a manual diagnostic.

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

Commit or stash the current application changes before writing a migration.
The codemod does not revert unrelated local changes.

## Preview the migration

Run the command from the application workspace:

```shell
npx craft-migrate \
  --project tsconfig.app.json \
  --root src \
  --dry-run
```

For an Angular CLI workspace, the project file is commonly under the
application directory:

```shell
npx craft-migrate \
  --project projects/my-app/tsconfig.app.json \
  --root projects/my-app/src \
  --dry-run
```

Use a JSON report when the diagnostics need to be reviewed or archived:

```shell
npx craft-migrate \
  --project tsconfig.app.json \
  --root src \
  --dry-run \
  --json migration-report.json
```

## Apply the migration

```shell
npx craft-migrate \
  --project tsconfig.app.json \
  --root src \
  --write
```

`--write` runs ESLint fixes on files touched by the primitive and service
migrations. Use `--no-eslint` only when linting is managed separately.

The specialized commands remain available when a migration must be applied or
debugged one stage at a time:

```shell
npx craft-migrate-primitives --project tsconfig.app.json --root src --write
npx craft-migrate-services --project tsconfig.app.json --root src --write
npx craft-migrate-routes --project tsconfig.app.json --root src --write
```

## Work remaining after the codemod

Search the generated report and source code for migration diagnostics. In
particular, complete the following work before considering the migration done:

- Rewrite Angular Signal Forms as `state(name, ..., insertForm(...))`.
- Consume every primitive invocation (`state`, `query`, `mutation`,
  `asyncProcess`, `queryParams`): `yield*` inside a generator factory,
  `craftUse(...)` in a component field. The
  `craft-ng/require-primitive-generator-unwrap` ESLint rule reports and
  autofixes the remaining bare calls, and
  `migrate-primitive-generators --paths <glob>` migrates whole directories.
- Map synchronous validators to `cRequired`, `cMaxLength`, and the other Craft
  validators.
- Replace asynchronous form validation with `query` and `cAsyncValidate`.
- Replace form submission workflows with `mutation` and `insertFormSubmit`.
- Resolve every `CRAFT_IMPLEMENTATION_REQUIRED` companion service.
- Review generated service scopes and move `provideX(...)` close to the route or
  feature that owns the instance.
- Replace remaining direct Angular `inject(...)` calls with `toCraftService(...)`
  adapters, then consume their generated `X()` helpers with `yield*`. The former
  `injectX` and `XToYield` helpers are no longer part of the API.
- Resolve imperative workflow diagnostics instead of only removing their
  comments.
- Migrate guards, dynamic redirects, nested route collections, inherited route
  providers, and other route diagnostics that could not be inferred safely.
- Confirm `componentDeps`, route provider names, and file-level DI checks are
  complete.
- Review HTTP mutations and subscriptions whose callback or lifecycle
  semantics could not be moved automatically.

## Verify the result

First make remaining migration work fail CI:

```shell
npx craft-migrate \
  --project tsconfig.app.json \
  --root src \
  --check \
  --fail-on-manual
```

Then run the normal project verification:

```shell
npx eslint "src/**/*.ts"
npx tsc --noEmit -p tsconfig.app.json
npx ng test
npx ng build
```

Use the workspace-specific lint, test and build commands when they differ.
Finally, exercise forms, navigation, pending/error UI, and write operations in
the browser: those lifecycle behaviours cannot be fully established by a
structural codemod.
