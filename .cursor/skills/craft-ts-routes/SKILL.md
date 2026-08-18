---
name: craft-ts-routes
description: Best practices for creating and maintaining type-safe routes in Angular apps that use @craft-ts/core (craft-ts). Use this whenever you create or edit a routes file, call craftRoutes(...) / route(...), declare componentDeps, wire loadChildren, add a pendingComponent or a view-transition payload, see a "TS2589 excessively deep" error in a routes file, or need a per-file DI check (ValidateCascadeRoutesFile / RouteCheckedDI). Apply it even when the user only says "add a route", "split this routes file", "fix this routing type error", or "the injectXxx helper is missing" — getting the DI checks, the loadChildren split, and exhaustiveness right is non-obvious and easy to skip, and skipping it silently disables type-safe DI.
---

# Creating craft-ts routes

## Objective

Produce route files that keep **compile-time dependency-injection safety** intact. In craft-ts a route
is not just a path → component map: each route declares the dependencies its component injects
(`componentDeps`), and a per-file check turns any unmet dependency into a TypeScript error. The whole
value proposition collapses the moment a route ships without its check, so the rules below are about
never letting that happen — while staying under TypeScript's instantiation ceiling.

If the public API names here don't match the installed version, confirm against the app's own routes and
`node_modules/@craft-ts/core`; prefer the patterns already used in the repo.

## The rules you must not skip

1. **Wrap routes in `craftRoutes(name, [...])`** — never export a plain Angular `Routes` array. Give every
   component route a `componentDeps: {} as import('./x').GenDeps_X` line. That line is the wire between
   the component's generated dependency type and the route check; without it the route's DI is invisible.

2. **Every `craftRoutes(...) file carries its own DI check.`** Add, in the same file:
   ```ts
   type _CheckXDI = ValidateCascadeRoutesFile<ParentNames, ParentValues, typeof xRoutes>;
   type _CanRunX = CanRun<_CheckXDI>;
   ```
   This is the *iron rule*: the check reads only the current collection and **does not descend into
   `loadChildren`**, so each file — including lazy children — must re-declare it or its components go
   unchecked. A missing provider then surfaces as `Injected SomeService is not provided in path: "…"`.
   Architecture tests (`assertRouteDiProofs`) fail CI if a collection ships without an armed check.
   That helper belongs in the app's `architecture/` suite — load `craft-ts-architecture-tests` to
   scaffold or keep it armed. Do not add an architecture rule for the feature.

3. **Stay under the instantiation ceiling — split with `loadChildren`.** One collection has a finite
   route budget; past it TypeScript throws `TS2589: Type instantiation is excessively deep`, which then
   **collapses inference for the whole file** (helpers vanish, `route(...)` calls degrade). The fix is
   architectural, not a tweak: move routes into lazy child collections joined by `loadChildren`, each with
   its own check. See [references/scaling-and-pitfalls.md](references/scaling-and-pitfalls.md).

4. **Keep exception handling exhaustive.** A route whose `canActivate` / `canMatch` / `resolve` can throw
   a typed `craftException` must handle exactly those codes. Use the 3-arg `route(path, def, handlers)`
   form, or assert the whole collection with `assertExhaustiveRouteExceptions(xRoutes)`.

5. **Let ESLint do the bookkeeping — don't hand-maintain the checks.** The check blocks, the `GenDeps_*`
   aliases, the asserts and imports are all generated/refreshed by ESLint `--fix`. Run it after editing
   routes or a component's DI shape rather than editing those blocks by hand (an ESLint error is *not* a
   compile error, so a stale check silently hides real DI bugs). See
   [references/eslint-workflow.md](references/eslint-workflow.md).

## Anatomy of a correct routes file

Use this as the template for a new collection. The app-level parent context is `<never, Router>` (no
extra named providers; `Router` is provided by value). For a child mounted under a route that adds
`providers`, thread the cumulative context instead — see the DI-checks reference.

```ts
import {
  craftRoutes,
  route,
  assertExhaustiveRouteExceptions,
  type CanRun,
  type ValidateCascadeRoutesFile,
} from '@craft-ts/core';
import type { Router } from '@angular/router';

export const { featureRoutes, injectFeatureUserIdParams } = craftRoutes('feature', [
  route(':userId', {
    componentDeps: {} as import('./user-detail').GenDeps_UserDetailComponent,
    loadComponent: () => import('./user-detail'),
    // guards / resolve / providers / queryParams as needed
  }),
]);

// Exhaustive over canActivate ∪ canMatch ∪ resolve for the whole collection.
assertExhaustiveRouteExceptions(featureRoutes);

// DI safety for THIS collection — the parent's cascade does NOT cover loadChildren.
type _CheckFeatureDI = ValidateCascadeRoutesFile<never, Router, typeof featureRoutes>;
type _CanRunFeature = CanRun<_CheckFeatureDI>;
```

The parent registers the child as a near-free lazy entry:

```ts
// app.routes.ts
{
  path: 'feature',
  loadChildren: () => import('./feature.routes').then((m) => m.featureRoutes),
},
```

## Decision rules

- **Adding a component route** → add `loadComponent` (or `component`) **and** `componentDeps:
  {} as import('./x').GenDeps_X`. If `GenDeps_X` doesn't exist yet, generate it (ESLint Quick Fix
  `brand-angular-gen-deps-required`, or `craft:brand`), don't write it by hand.
- **A routes file is getting large / hits TS2589** → don't fight the type; split a slice into a new
  `craftRoutes(...)` file mounted via `loadChildren`, and give that file its own check. Repeat as a tree.
- **A lazy child only makes sense under one specific path** (it relies on that route's params, payload, or
  providers) → pin it with `.withParent<ParentRoutes<'path'>>()` and enforce placement in the parent with
  `assertChildRouteMounts(parentRoutes)`. See the scaling reference.
- **Slow guard/resolve + you want a skeleton** → add `pendingComponent: () => import('./skeleton')`. The
  cascade never sees the skeleton, so verify its DI separately with a per-component `RouteCheckedDI`. For a
  shared-element morph, declare the payload with `viewTransitionPayload<T>()`. See
  [references/pending-and-exceptions.md](references/pending-and-exceptions.md).
- **A single file genuinely must hold a big flat list** (no natural `loadChildren` boundary) → switch from
  `ValidateCascadeRoutesFile` to the per-route `RouteCheckedDI` (no recursion between routes, scales to
  thousands). See the DI-checks reference.
- **You changed a component's `inject`/`imports`/`providers`** → regenerate its `GenDeps_*` (Quick Fix /
  `craft:brand`) so the route check sees the new shape, then re-run ESLint `--fix` on the routes file.

## Never do this

- Export a plain `Routes` array, or omit `componentDeps` on a routed component — the route's DI becomes
  unchecked.
- Ship a `craftRoutes(...)` file without its own check, or assume the parent's check covers a
  `loadChildren` child — it does not.
- "Fix" a `TS2589` by deleting the check or casting to `any` — that hides every DI error in the file.
  Split with `loadChildren` instead.
- Hand-edit the generated `_Check*` / `_CanRun*` blocks or `GenDeps_*` aliases — run ESLint `--fix`.

## References

- [references/di-checks.md](references/di-checks.md) — the per-file check in depth: `ValidateCascadeRoutesFile`,
  threading the parent DI context, the `RouteCheckedDI` escape hatch, and `GenDeps_*` regeneration.
- [references/scaling-and-pitfalls.md](references/scaling-and-pitfalls.md) — the TS2589 ceiling, the
  loadChildren-tree architecture, `.withParent` + `assertChildRouteMounts`, and approaches that look
  tempting but don't work (so you don't re-derive them).
- [references/pending-and-exceptions.md](references/pending-and-exceptions.md) — `pendingComponent` DI
  verification, `viewTransitionPayload`, `handleExceptions`, and exhaustiveness.
- [references/eslint-workflow.md](references/eslint-workflow.md) — the ESLint rules that keep all of the
  above in sync, and the `--fix` workflow.
