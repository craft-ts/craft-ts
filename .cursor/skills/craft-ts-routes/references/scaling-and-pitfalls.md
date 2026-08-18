# Scaling routes & the instantiation ceiling

## The ceiling, and why it's loud

`ValidateCascadeRoutesFile` instantiates a recursive type over the route tuple. TypeScript caps both how
**deep** it will recurse and how many instantiations it will do in **total**, so a single collection has a
finite budget — in practice a few dozen routes, sooner if routes carry guards / `resolve` /
`handleExceptions` (each costs several times more than a trivial route).

Past the budget:

```
TS2589: Type instantiation is excessively deep and possibly infinite.
  app.routes.ts → ValidateCascadeRoutesFile<never, Router, typeof appRoutes>
```

**Watch the knock-on collapse.** A `TS2589` makes TypeScript abandon that type and fall back to `any`,
which poisons inference of neighbouring `const`s in the *same file*. The symptoms are misleading:
`route(...)` calls degrade to a bare builder type, the `craftRoutes(...)` helpers go missing
(`Property 'injectXxx' does not exist`), `craftRouterLink` targets type as `never`. The root cause is the
overflowing check — fix that, not the symptoms.

## The fix is architectural: a tree of `loadChildren`

Don't shrink the check or cast to `any`. Move routes into lazy child collections joined by `loadChildren`
(which you want anyway for code-splitting), each with **its own** check:

```
app.routes.ts                 # "manifest": ~N cheap { path, loadChildren } entries
├── billing.routes.ts         # ~15–20 leaf routes + its own ValidateCascadeRoutesFile
├── admin.routes.ts           # ~15–20 leaf routes + its own check
└── reporting.routes.ts       # if itself large → re-split into sub-loadChildren (level 3+)
```

- A `{ path, loadChildren }` entry has no `componentDeps`, so it is **nearly free** in the parent's check —
  the manifest can list dozens.
- Each feature file pays only for its own leaves. ~500 routes ÷ ~17 per file ≈ ~30 files; two levels are
  plenty and you can nest further without limit.
- The takeaway: **DI is always verified — never drop the check; move it next to the routes it covers.**

The child returns its named collection from `loadChildren`:

```ts
// app.routes.ts
{ path: 'billing', loadChildren: () => import('./billing.routes').then((m) => m.billingRoutes) },
```

## Pinning a child to its mount — `.withParent` + `assertChildRouteMounts`

A child whose components rely on a *specific* mount (its `:param`, a view-transition payload, an ancestor's
providers) is only correct under that one path. Nothing enforces that by default. Pin it:

```ts
// view-transitions.routes.ts — the child declares where it belongs
import { craftRoutes, route, type ParentRoutes } from '@craft-ts/core';

export const { viewTransitionsRoutes } = craftRoutes('viewTransitions', [
  route(':photoId', { /* … */ }),
]).withParent<ParentRoutes<'view-transitions'>>();
```

```ts
// app.routes.ts — the parent enforces placement (scoped to this file)
import { assertChildRouteMounts, craftRoutes } from '@craft-ts/core';

export const { demoRoutes } = craftRoutes('demo', [
  { path: 'view-transitions', loadChildren: () => import('./view-transitions.routes').then((m) => m.viewTransitionsRoutes) },
]);

assertChildRouteMounts(demoRoutes);
```

Mount the pinned collection elsewhere and the **parent file** fails to compile:

```
craftRoutes(...).withParent<ParentRoutes<'view-transitions'>>() must be
loadChildren-mounted under the route with path 'view-transitions', not 'admin'
```

- **Opt-in.** A collection without `.withParent` is unpinned and mountable anywhere (backward compatible).
  Pin only the children whose placement actually matters.
- **Scoped to the parent.** `assertChildRouteMounts` reads the parent's own routes — it doesn't re-validate
  the child, so it adds nothing to the child's budget.
- **Type-only.** `.withParent<…>()` returns the same object at runtime; `ParentRoutes<'path'>` carries only
  the path string, so it creates no runtime coupling.
- **ESLint** (`require-child-route-mount-check`) adds the missing `assertChildRouteMounts(...)` + import on
  `--fix`. Whether a child opts in with `.withParent` stays your call.

## Pitfalls — approaches that look tempting but don't work

These were tried and rejected; recording them so they aren't re-derived.

- **Casting away a `TS2589`** (`as any`, deleting the check, `@ts-ignore`). It silences the error but
  disables DI checking for the whole file — the opposite of the goal. Always split with `loadChildren`.

- **Enforcing child placement inside `craftRoutes(...)` itself** (weaving a mount check into the `routes`
  argument type so a wrong mount errors at the literal). It type-checks, but the extra per-collection
  instantiation tips already-at-ceiling files into `TS2589` — even a 2-route child with no `loadChildren`
  pays the cost, because *every* collection runs the same inference. Placement checks must be **scoped to
  the parent** that mounts children (a standalone `assertChildRouteMounts`), not folded into the hot
  `craftRoutes` path every file pays.

- **A `loadChildrenType: {} as typeof import('./x').xRoutes` carrier** to skip inferring the child through
  `import().then()`. In isolation it builds; applied broadly it **materialises the child's full type
  (components included)**, creating a **circular reference** for any child whose components inject the
  *parent's* route data (`TS2615` "circularly references itself" + `TS2589`). The dynamic-import resolution
  it replaced is cycle-safe and, measured against build-time noise, no slower — so don't add such a carrier.

- **Auto-deriving the parent context** from the app config in a generic constraint
  (`AppProvidedServiceNamesOf<typeof appConfig>`). It overflows when app providers are complex. List the
  value types explicitly: `<never, Router, …>`.
