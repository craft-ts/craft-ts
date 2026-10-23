---
name: craft-ts-service-migration
description: Guides one-way migration of existing Angular services to @craft-ts/core craftService patterns. Use when migrating @Injectable classes, inject(...), framework services, service tests, or route DI checks.
---

# craft-ts Service Migration

Use this skill when a task touches dependency injection, service architecture, or migration from an existing Angular codebase to `@craft-ts/core`.

## Target Architecture

- Application/domain services are authored with `craftService(...)`.
- Dependencies are implemented as Craft services or replaced with Craft APIs; runtime Angular DI adapters are not part of the target architecture.
- Components, route guards, resolvers, primitives, and other craft services consume generated `X()` helpers.
- Route DI checks rely on Craft service provider names.

## Migration Workflow

1. Inventory the current dependency:
   - Find `@Injectable`, `inject(...)`, constructor injection, `InjectionToken`, `HttpClient`, `Router`, `Dialog`, `Title`, and app-specific API services.
   - Classify each dependency as authored business logic or an external/framework dependency that needs a Craft-native replacement.

2. Choose the right primitive:
   - Business/domain logic -> `craftService({ name, scope }, function* () { ... })`.
   - Replace framework dependencies with Craft APIs or migrate their required behavior into a Craft service.
   - If a dependency cannot be converted automatically, leave the source intact and report it for manual migration; do not generate an interop adapter.
   - Dependencies that must be provided per feature/route/test -> `scope: 'toProvide'` or `scope: 'manuallyProvidedAtRoot'`.

3. Preserve the public interface deliberately:
   - Expose the smallest useful Craft-native service surface.
   - Avoid pass-through wrappers around framework services.

4. Replace consumption sites:
   - In components/pages and craft service generators: use the generated `X()` helper, typically as `yield* X(...)`.
   - In guards/resolvers/route helpers: use craft helpers and keep thrown exceptions typed.
   - Remove direct Angular `inject(...)` and constructor injection from migrated code.

5. Update DI registration:
   - Add `provideX(...)` where the selected scope requires it.
   - Keep route-level providers close to the route that owns the instance.
   - Re-export cumulative route provider names only when child route files need them.

6. Refresh generated artifacts:
   - Run ESLint `--fix` for `brand-angular-gen-deps-required` and `brand-angular-deps-match`.
   - Check route files still have `componentDeps` and per-route `RouteCheckedDI` checks.
   - If direct Angular tokens disappeared, remove them from `ProvidedValues`; prefer `never`.

## Route DI Rule

For migrated features, prefer:

```ts
type _CheckFeatureDI = RouteCheckedDI<
  ComponentDeps,
  AppProvidedNames,
  AppProvidedValues,
  'feature'
>;
type _CanRunFeature = CanRun<_CheckFeatureDI>;
```

Keep `ProvidedValues` limited to Craft service values. Migrate remaining framework-token dependencies before declaring a route migration complete.

## ESLint Expectations

Ensure these rules are enabled for migrated projects:

- `craft-ts/prefer-craft-service`: blocks new `@Injectable` / `@Service` app services.
- `craft-ts/prefer-craft-http-client`: keeps HTTP access inside craft-compatible APIs.
- `craft-ts/brand-angular-gen-deps-required` and `craft-ts/brand-angular-deps-match`: keep `GenDeps_*` current.
- Route rules: `require-assert-exhaustive-route-exceptions`, `require-pending-component-di-check`, and `require-child-route-mount-check`.

## Review Checklist

- [ ] No new direct Angular `inject(...)` in app code.
- [ ] No new app-authored `@Injectable` service where `craftService` fits.
- [ ] Framework dependencies use Craft-native APIs or have a tracked manual migration diagnostic.
- [ ] Consumption sites use the generated `X()` helper.
- [ ] Route checks use provider names, with `ProvidedValues = never` after migration.
- [ ] `GenDeps_*` aliases are regenerated after dependency changes.
- [ ] Tests use Craft service testing helpers and `CraftTestBed` where needed.

## When To Push Back

Push back when a change introduces a runtime Angular DI adapter, adds a pass-through `craftService` with no meaningful interface, or disables DI checks to avoid fixing provider registration.
