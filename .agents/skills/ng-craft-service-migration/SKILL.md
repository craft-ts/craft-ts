---
name: ng-craft-service-migration
description: Guides migration of existing Angular services and direct Angular DI toward @craft-ng/core craftService/toCraftService patterns. Use when editing or reviewing Angular services, @Injectable classes, inject(...), InjectionToken adapters, HttpClient/Router/Dialog usage, service tests, or route DI checks affected by service migration.
---

# ng-craft Service Migration

Use this skill when a task touches dependency injection, service architecture, or migration from an existing Angular codebase to `@craft-ng/core`.

## Target Architecture

- Application/domain services are authored with `craftService(...)`.
- Existing Angular tokens, framework services, third-party services, and `InjectionToken`s are adapted once with `toCraftService(...)`.
- Components, route guards, resolvers, primitives, and other craft services consume `injectX` / `XToYield` helpers, not Angular `inject(Token)`.
- Direct Angular DI is treated as legacy at the app boundary. Do not add new direct `inject(...)` calls.
- Route DI checks should rely on craft service provider names. Keep `ProvidedValues = never` unless supporting legacy direct Angular tokens is explicitly required.

## Migration Workflow

1. Inventory the current dependency:
   - Find `@Injectable`, `inject(...)`, constructor injection, `InjectionToken`, `HttpClient`, `Router`, `Dialog`, `Title`, and app-specific API services.
   - Classify each dependency as authored business logic, external Angular/framework token, or third-party adapter.

2. Choose the right primitive:
   - Business/domain logic -> `craftService({ name, scope }, function* () { ... })`.
   - Existing Angular/third-party token -> `toCraftService({ name, scope, token })`.
   - Existing token requiring `inject(...)` internally -> `toCraftService({ name, scope: 'global', inject: () => inject(TOKEN) })`.
   - Dependencies that must be provided per feature/route/test -> `scope: 'toProvide'` or `scope: 'manuallyProvidedAtRoot'`.

3. Preserve the public interface deliberately:
   - Expose the smallest useful surface from adapters.
   - Prefer yielding a narrowed method/property map: `yield* RouterToYield(undefined, ({ navigateByUrl }) => ({ navigateByUrl }))`.
   - Avoid pass-through wrappers that expose the whole Angular service unless the service is intentionally an adapter.

4. Replace consumption sites:
   - In components/pages: use `injectX()` from the craft service.
   - In craft service generators: use `yield* XToYield(...)`.
   - In guards/resolvers/route helpers: use craft helpers and keep thrown exceptions typed.
   - Remove direct Angular `inject(...)` and constructor injection from migrated code.

5. Update DI registration:
   - Add `provideX(...)` where the selected scope requires it.
   - Keep route-level providers close to the route that owns the instance.
   - Re-export cumulative route provider names only when child route files need them.

6. Refresh generated artifacts:
   - Run ESLint `--fix` for `brand-angular-gen-deps-required` and `brand-angular-deps-match`.
   - Check route files still have `componentDeps` and `ValidateCascadeRoutesFile` or `RouteCheckedDI`.
   - If direct Angular tokens disappeared, remove them from `ProvidedValues`; prefer `never`.

## Route DI Rule

For migrated features, prefer:

```ts
type _CheckFeatureDI = ValidateCascadeRoutesFile<
  AppProvidedNames,
  never,
  typeof featureRoutes
>;
type _CanRunFeature = CanRun<_CheckFeatureDI>;
```

Use `ProvidedValues` only as a temporary legacy bridge for direct Angular tokens still injected by components. Treat unions like `Router | Dialog | Title | typeof SomeApi` in route files as migration debt unless the user explicitly wants legacy support.

## ESLint Expectations

Ensure these rules are enabled for migrated projects:

- `craft-ng/no-angular-inject`: blocks Angular `inject(...)` and points toward `injectX`.
- `craft-ng/prefer-craft-service`: blocks new `@Injectable` / `@Service` app services.
- `craft-ng/prefer-craft-http-client`: keeps HTTP access inside craft-compatible APIs.
- `craft-ng/brand-angular-gen-deps-required` and `craft-ng/brand-angular-deps-match`: keep `GenDeps_*` current.
- Route rules: `require-assert-exhaustive-route-exceptions`, `require-pending-component-di-check`, and `require-child-route-mount-check`.

## Review Checklist

- [ ] No new direct Angular `inject(...)` in app code.
- [ ] No new app-authored `@Injectable` service where `craftService` fits.
- [ ] Angular/framework tokens adapted exactly once with `toCraftService`.
- [ ] Consumption sites use `injectX` or `XToYield`.
- [ ] Route checks use provider names, with `ProvidedValues = never` after migration.
- [ ] `GenDeps_*` aliases are regenerated after dependency changes.
- [ ] Tests use craft service testing helpers instead of TestBed-only service wiring where possible.

## When To Push Back

Push back when a change adds a direct Angular token to `ProvidedValues` instead of adapting it with `toCraftService`, introduces a pass-through `craftService` with no meaningful interface, or disables DI checks to avoid fixing provider registration.
