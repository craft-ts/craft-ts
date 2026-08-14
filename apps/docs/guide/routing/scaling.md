# Scaling routes

`ValidateCascadeRoutesFile` walks every route in a collection **at the type
level**, so a single routes file has a finite budget before TypeScript's
instantiation ceiling. This page is about what happens at that ceiling, and how
to organise routes so you never reach it.

::: tip You don't need this yet
If your app has one routes file with a handful of routes,
[Setup](/guide/routing/setup) is enough. Come back when a file grows past a few
dozen routes, or when you see `TS2589`.
:::

## Large route files — the cascade DI depth limit

`ValidateCascadeRoutesFile<…, typeof appRoutes>` walks **every** route in the collection at the type
level. TypeScript caps how deeply it will instantiate a recursive type, so a single collection has a
**finite route budget**. Past it (in practice a few dozen routes, sooner if routes carry guards /
`resolve` / `handleExceptions`), the check overflows:

```
TS2589: Type instantiation is excessively deep and possibly infinite.
  app.routes.ts → ValidateCascadeRoutesFile<never, Router, typeof appRoutes>
```

::: warning Watch out for the knock-on collapse
A `TS2589` makes TypeScript abandon that type and fall back to `any`, which **poisons inference of
neighbouring `const`s in the same file**. The visible symptoms are misleading: `craftRoute(...)` calls
collapse to `RouteWithProvidersBuilder<{ path }>`, the `craftRoutes(...)` helpers go missing
(`Property 'injectXxx' does not exist`), and `craftRouterLink` targets type as `never`. The root
cause is the overflowing check, not those routes.
:::

**Solution — split into a lazy child collection, and keep its own DI check.** The cascade check
reads only the _current_ collection's metadata; it does **not** descend into `loadChildren`. So move
the extra routes into their own `craftRoutes(...)` file and reference it via `loadChildren`. That
keeps the parent file under budget — **but a child collection ships with _no_ DI checking unless you
add one**, so re-declare the check in the child file to keep DI sound. [Architecture
tests](/guide/testing/architecture#assertroutediproofs) fail if that child proof is missing.

```ts
// feature.routes.ts — its own lazy collection
import {
  craftRoutes,
  craftRoute,
  type CanRun,
  type ValidateCascadeRoutesFile,
} from '@craft-ng/core';
import type { Router } from '@angular/router';

export const { featureRoutes } = craftRoutes('feature', [
  craftRoute('', {
    componentDeps: {} as import('./feature').GenDeps_Feature,
    loadComponent: ({ withRetry }) => withRetry(import('./feature')),
    // guards / resolve / handleExceptions …
  }),
]);

// DI safety for THIS collection — `app.routes.ts` does NOT cover loadChildren.
// Same parent context the parent route runs under: app-level `Router` by value,
// no extra named providers.
type _CheckFeatureDI = ValidateCascadeRoutesFile<
  never,
  Router,
  typeof featureRoutes
>;
type _CanRunFeature = CanRun<_CheckFeatureDI>;
```

```ts
// app.routes.ts — a cheap loadChildren entry, outside the parent's budget
{
  path: 'feature',
  loadChildren: ({ withRetry }) =>
    withRetry(import('./feature.routes')).then((m) => m.featureRoutes),
},
```

A missing provider in the child collection now surfaces as a TypeScript error **in the child file**,
exactly like the main one:

```
The SomeService service is not provided in path: ""
```

If a single feature is itself large, repeat the split, or break one big collection into several
`craftRoutes(...)` collections each with its own check — every check then validates a smaller slice
and stays under the depth limit. The takeaway: **DI is always verified — never drop the check; move
it next to the routes it covers.**

### Why the budget exists (the mechanism)

`ValidateCascadeRoutesFile` recurses over the route tuple **4 routes per step**, so a file of `N`
routes recurses to depth `N / 4`. Two distinct TypeScript ceilings are in play:

- **Instantiation _depth_** (the `TS2589` "excessively deep" error). The 4-at-a-time unrolling is what
  fights this: it quarters the recursion depth, so the wall moves from ~50 routes to a few hundred —
  but it is still a per-file ceiling.
- **Total instantiation _count_**. Each route pays one full `RouteCheckedDI` instantiation (walking its
  `GenDeps`, the `missingProvider` map, the parent context). The total cost is therefore roughly
  **`N × cost-per-route`**, and a route carrying guards / `resolve` / `handleExceptions` costs several
  times more than a trivial one. This is why "a few dozen" is only a rough figure — the real budget is
  in route-_cost_, not route-_count_.

## Scaling to hundreds of routes

The split above is not a one-off patch — it is the architecture. Organise routes as a **tree of feature
files joined by `loadChildren`** (which you want anyway for code-splitting):

```
app.routes.ts                 # "manifest": ~N cheap { path, loadChildren } entries
├── billing.routes.ts         # ~15–20 leaf routes + its own check
├── admin.routes.ts           # ~15–20 leaf routes + its own check
└── reporting.routes.ts       # if itself large → re-split into sub-loadChildren (level 3+)
```

- A `{ path, loadChildren }` entry has no `componentDeps`, so it is **nearly free** in the parent's
  cascade check — the manifest can list dozens of them.
- Each feature file pays the budget for **its own leaves only**. ~500 routes ÷ ~17 per file ≈ ~30
  files; two levels are plenty, and you can nest further without limit.
- **Every `craftRoutes(...)` file re-declares its own check** (see the iron rule above). With many
  files this is easy to forget and fails silently, so enable
  `craft-ng/require-cascade-route-di-check`.

::: tip Threading the parent DI context
The child check's parent context (`ParentNames`, `ParentValues`) is everything provided **at its mount
point** — app providers **plus** every ancestor route's providers. When no ancestor adds `providers`,
this is just the app context (`<never, Router, …>`, as in the examples above), identical in every file.
When an ancestor route _does_ add providers, re-export its cumulative context and union your own onto it:

```ts
// billing.routes.ts (mounted under a route with providers: [provideBilling()])
export type BillingChildNames = AppProvidedNames | 'BillingService';
export type BillingChildValues = AppProvidedValues;

// sub-billing.routes.ts
type _Check = ValidateCascadeRoutesFile<
  BillingChildNames,
  BillingChildValues,
  typeof subRoutes
>;
```

Forgetting to fold in an ancestor's provider makes the child check wrong (a real missing-provider bug
slips through, or a provided service is flagged as missing), so keep the re-export next to the route
that adds the providers.
:::

### Escape hatch — the `O(1)`-per-route check

If a single file genuinely must hold a large flat list (no natural `loadChildren` boundary), switch it
from the aggregated `ValidateCascadeRoutesFile` to the **per-route** `RouteCheckedDI`. It validates one
component at a time with **no recursion between routes**, so it never hits the depth ceiling and scales
to thousands of routes in one file — at the cost of one check block per component instead of one per
file:

```ts
import { type CanRun, type RouteCheckedDI } from '@craft-ng/core';

type _CheckItem0 = RouteCheckedDI<
  import('./item-0').GenDeps_Item0Component,
  AppProvidedNames,
  AppProvidedValues,
  'Item0Component'
>;
type _CanRunItem0 = CanRun<_CheckItem0>;
// …one pair per route component
```

Prefer the tree-of-`loadChildren` approach (it also lazy-loads); reach for `RouteCheckedDI` only when a
single big file is unavoidable.

## Pinning a lazy child to its mount path (`.withParent` + `assertChildRouteMounts`)

Splitting into `loadChildren` keeps each file under budget, but nothing yet guarantees a child is wired
under the **right** parent route. A child whose components rely on a specific mount — its `:photoId`
param, a declared view-transition payload, an ancestor's `providers` — is only correct under that path.
Mount it elsewhere and its DI assumptions break silently.

Pin a collection to its mount path with `.withParent<ParentRoutes<'path'>>()`, then enforce it once in
the parent with `assertChildRouteMounts(parentRoutes)`:

```ts
// view-transitions.routes.ts — the child declares where it belongs
import { craftRoutes, craftRoute, type ParentRoutes } from '@craft-ng/core';

export const { viewTransitionsRoutes } = craftRoutes('viewTransitions', [
  craftRoute(':photoId', {
    componentDeps: {} as import('./photo-detail').GenDeps_PhotoDetailComponent,
    loadComponent: ({ withRetry }) => withRetry(import('./photo-detail')),
    // …
  }),
]).withParent<ParentRoutes<'view-transitions'>>();
```

```ts
// app.routes.ts — the parent enforces placement (scoped to this file)
import { assertChildRouteMounts, craftRoutes } from '@craft-ng/core';

export const { demoRoutes } = craftRoutes('demo', [
  {
    path: 'view-transitions',
    loadChildren: ({ withRetry }) =>
      withRetry(import('./view-transitions.routes')).then(
        (m) => m.viewTransitionsRoutes,
      ),
  },
]);

assertChildRouteMounts(demoRoutes);
```

Mount the pinned collection under any other path and the **parent file** fails to compile:

```
craftRoutes(...).withParent<ParentRoutes<'view-transitions'>>() must be
loadChildren-mounted under the route with path 'view-transitions', not 'admin'
```

Notes:

- **Opt-in.** A collection without `.withParent` is _unpinned_ and mountable anywhere — fully backward
  compatible. Pin only the children whose placement actually matters.
- **Scoped to the parent.** `assertChildRouteMounts` reads the parent's **own** routes (`_routes`) — it
  does **not** descend into / re-validate the child (already checked in its own file), so it adds nothing
  to the child's instantiation budget.
- **Type-only.** `.withParent<…>()` returns the same object at runtime; `ParentRoutes<'path'>` carries no
  value, only the path string — so importing it creates no runtime coupling between the files.
- **Enforced by ESLint.** `craft-ng/require-child-route-mount-check` adds the missing
  `assertChildRouteMounts(...)` call + import on `--fix`. (Whether a child opts in with `.withParent`
  stays your decision — it expresses the "this belongs here" intent the rule can't guess.)

::: details Design notes — two approaches we rejected
Reaching the standalone-assert design above took two dead ends, both defeated by TypeScript's
instantiation ceiling. They're recorded here because the failure modes are instructive.

**1. Enforcing placement inside `craftRoutes(...)` itself.** The first attempt wove the mount check into
the `routes` argument type of **every** `craftRoutes(...)` call, so a wrong mount would error right at
the route literal. It type-checked — but the extra per-collection instantiation tipped an
already-at-ceiling file into `TS2589`, and even a 2-route child with **no** `loadChildren` paid the cost
(every collection runs the same inference). The lesson: the check must be **scoped to the parent that
actually mounts children** — a standalone `assertChildRouteMounts(...)` reading the raw `_routes` — not
folded into the hot `craftRoutes` inference that every file pays on every build.

**2. A `loadChildrenType` carrier to speed up the check.** To avoid inferring the child's type through the
dynamic `import('./x').then((m) => m.xRoutes)`, we tried an explicit
`loadChildrenType: {} as typeof import('./x').xRoutes` field on the lazy route. In isolation it built
fine — but applied across the board it **materialises the child's full type (components included)**,
which creates a **circular reference** for any child whose components inject the _parent's_ route data
(`TS2615` "circularly references itself" + `TS2589`): `parent → typeof childRoutes → child components →
inject parent data → parent`. Since the dynamic-import resolution it replaced was both cycle-safe and —
once measured against build-time noise — no slower, the carrier was dropped. `assertChildRouteMounts`
resolves the child's pin through the existing `loadChildren` instead.
:::

## See Also

- [Setup](/guide/routing/setup)
- [Architecture rules](/guide/testing/architecture) — `assertRouteDiProofs` catches a split file with no check
- [Route providers](/guide/routing/route-providers)
