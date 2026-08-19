# Migrating an existing application

`craft-migrate` runs the CraftTS codemods in a safe, explicit order:

1. primitive migration points
2. service composition
3. typed route collections and dependency checks
4. legacy `component(...)` factories to `craftComponent(name, ...)`
5. baseline architecture tests

The migration is intentionally conservative. Deterministic transformations are
written automatically; code requiring a business or lifecycle decision is
reported as a manual diagnostic.

## Install the migration tool

```shell
npm install @craft-ts/core
npm install --save-dev @craft-ts/dev-tools@beta
```

The migration binaries are available from the `beta` tag. Verify the resolved
version before starting:

```shell
npm ls @craft-ts/dev-tools
```

Point the coding agent at [coding agents](/resources/ai-agents) so it uses
`craft-migrate` through the `migrate-to-craft-ts` skill. The final step
scaffolds the [architecture suite](/guide/testing/architecture) as the graph
contract. Do not add one architecture rule per migrated feature.

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

Use a JSON report when diagnostics need to be reviewed or archived:

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
npx craft-migrate-components --project tsconfig.app.json --root src --write
npx craft-migrate-architecture --project tsconfig.app.json --root src --write
```

For a pasted HTML or Web Component snippet, use the standalone template
converter:

```shell
printf '<section><h2>Hello</h2></section>' | npx craft-migrate-template
```

The generated callback can be pasted as the fourth argument of
`craftComponent(...)`. The interactive [template converter](/guide/components/template-migrator)
uses the same converter.

## Work remaining after the codemod

Search the generated report and source code for migration diagnostics. Complete
the following before considering the migration done:

- Consume every primitive invocation inside a generator with `yield*`, or use
  `craftUse(...)` at a synchronous boundary.
- Map synchronous validators to `cRequired`, `cMaxLength`, and the other Craft
  validators.
- Replace asynchronous validation with `query` and `cAsyncValidate`.
- Replace form submission workflows with `mutation` and `insertFormSubmit`.
- Resolve every `CRAFT_IMPLEMENTATION_REQUIRED` companion service.
- Review service scopes and move `provideX(...)` close to the route or feature
  that owns the instance.
- Resolve imperative workflow diagnostics instead of only removing comments.
- Migrate guards, dynamic redirects, nested route collections, inherited route
  providers, and other route diagnostics that could not be inferred safely.
- Confirm `componentDeps`, route provider names, and file-level DI checks.
- Review HTTP mutations and subscriptions whose lifecycle semantics could not be
  moved automatically.
- Add app-specific graph lookups in `architecture.spec.ts`.

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
npx vitest run --config vitest.architecture.config.ts
```

Use the workspace-specific lint, test, and build commands when they differ.
Finally, exercise forms, navigation, pending/error UI, and write operations in
the browser: those lifecycle behaviours cannot be fully established by a
structural codemod.
