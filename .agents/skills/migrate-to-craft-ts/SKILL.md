---
name: migrate-to-craft-ts
description: Migrate an Angular application to @craft-ts/core with the craft-migrate codemod, then resolve its manual diagnostics and verify the result. Use when the user asks to migrate an Angular project, services, signals, Signal Forms, dependency injection, HTTP resources, or routes to CraftTS; asks to run craft-migrate; or needs help finishing work left by the migration scripts.
---

# Migrate To NG Craft

Run the deterministic codemods first, then complete semantic migrations that
cannot be inferred safely. Preserve unrelated user changes.

## Workflow

1. Inspect the repository before modifying it:
   - Read `AGENTS.md`, `CONTEXT.md`, and relevant ADRs when present.
   - Check `git status --short`; do not overwrite existing changes.
   - Locate the application `tsconfig.app.json`, source root, ESLint config,
     tests, and build commands.
   - Read the installed `@craft-ts/core` version and avoid generating APIs that
     version does not expose.

2. Install or build `@craft-ts/dev-tools` only when needed.

3. Preview the complete migration:

   ```shell
   npx craft-migrate \
     --project path/to/tsconfig.app.json \
     --root path/to/src \
     --dry-run \
     --json craft-migration-report.json
   ```

4. Review diagnostics before writing. Classify them by primitives/forms,
   services/DI, and routes.

5. Apply deterministic changes:

   ```shell
   npx craft-migrate \
     --project path/to/tsconfig.app.json \
     --root path/to/src \
     --write \
     --json craft-migration-report.json
   ```

6. Complete the manual work described below.

7. Re-run in enforcement mode:

   ```shell
   npx craft-migrate \
     --project path/to/tsconfig.app.json \
     --root path/to/src \
     --check \
     --fail-on-manual
   ```

8. `craft-migrate --write` scaffolds the baseline architecture suite as its last
   step. If `architecture/` is still missing, load `craft-ts-architecture-tests`
   and offer `craft-migrate-architecture --write`. Do not add an architecture
   rule for each migrated feature.

9. Run targeted tests first, then lint, application type-check, architecture
   tests (`npx nx architecture <app>` or `npx vitest run --config vitest.architecture.config.ts`),
   full tests, and production build. Report command exit codes separately;
   filtered output is not proof that the complete command succeeded.

## Manual Migration Rules

### Signals and forms

- Convert Angular `signal` usage to `state`; preserve broad explicit types with
  `value as T satisfies T` when inference would narrow the state incorrectly.
- Convert Signal Forms to:

  ```ts
  const { myForm } = state(
    'myForm',
    initialValue,
    (context) =>
      craftPipe(
        context,
        ({ set, update }) => ({ set, update }),
        insertForm(/* field trees and submit */),
      ),
  )
  ```

- Use `insertSelectFormTree` and `insertFormAttributes` for nested fields.
- Map validators to `cRequired`, `cMaxLength`, and other Craft validators.
- Capture a parent sub-form state when a child validator depends on a sibling.
- Convert `validateAsync`/`rxResource` to a tracked `query` plus
  `cAsyncValidate`.
- Convert `submission.action` to a tracked `mutation` plus `insertFormSubmit`.
- Represent validation and submit failures with `craftException`.
- Do not generate `makeFormTreeInsert` solely to migrate a form.

### Services and dependency injection

- Author application/domain services with `craftService`.
- Adapt Angular, framework, and third-party tokens once with `toCraftService`.
- Use the generated `X()` helper in components and `yield* X(...)` in generators.
- Use `CraftRouter` directly instead of wrapping Angular Router.
- Prefer `scope: 'function'` for a dependency used by one function and
  `scope: 'toProvide'` for feature-owned services.
- Place `provideX(...)` near the route or feature owning the instance.
- Resolve every generated `CRAFT_IMPLEMENTATION_REQUIRED` companion.
- Wrap dependent primitives in `yield* track(...)`.
- Use `query` for reads and `mutation` for writes. Keep mutations with the
  lifecycle owner when moving subscription callbacks would alter semantics.

### Routes

- Complete unresolved guards, redirects, lazy collections, inherited
  providers, and dynamic route diagnostics manually.
- Keep `componentDeps` and file-level `ValidateCascadeRoutesFile` or
  `RouteCheckedDI` checks.
- Prefer provider names and `ProvidedValues = never` after direct Angular DI is
  removed.
- Run ESLint fixes to regenerate `GenDeps_*` aliases after dependency changes.

## Verification Checklist

- No unreviewed migration diagnostics or migration marker comments remain.
- No new direct Angular `inject(...)` or application `@Injectable` service was
  introduced.
- Signal Forms validate conditional and asynchronous fields correctly.
- Submit success, submit errors, navigation, and store cleanup work.
- HTTP mutations retain their intended callback and lifecycle behavior.
- Route pending/error UI and exception exhaustiveness compile.
- Targeted regression tests cover semantic rewrites.
- Lint, type-check, architecture tests, tests, and production build all pass.

If a diagnostic requires a business decision, stop before guessing and present
the exact file, diagnostic, available options, and behavioral tradeoff.
