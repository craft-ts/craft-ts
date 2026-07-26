# Setup

This guide assumes you are integrating type-safe DI/routes into an Angular app that consumes `@craft-ng/core`.

## Prerequisites

Install the runtime package and the dev tooling in your app:

```bash
npm install @craft-ng/core
npm install -D @craft-ng/dev-tools
```

## 1. Add a cascade DI check to every routes file

DI is checked next to the routes it covers. Every file containing `craftRoutes(...)` must pair its
collection with `ValidateCascadeRoutesFile` and `CanRun`; a parent check deliberately does not descend
through `loadChildren`.

```ts
import {
  craftRoutes,
  type CanRun,
  type ValidateCascadeRoutesFile,
} from '@craft-ng/core';
import type { Router } from '@angular/router';

export const { appRoutes } = craftRoutes('app', [
  /* routes */
]);

type _CheckAppDI = ValidateCascadeRoutesFile<never, Router, typeof appRoutes>;
type _CanRunApp = CanRun<_CheckAppDI>;
```

`ValidateCascadeRoutesFile` compares:

- the generated dependencies declared on every route
- the providers available from the app, parent mount, route and component

If a route depends on a service that is not provided, or if a routed component expects an input that
the route does not supply, `_CanRunApp` turns that mismatch into a TypeScript error in the routes file.

Typical errors look like:

- `Injected Counter is not provided in path: "some-path"`
- `Input "userId" is not provided in path: "some-path"`

## 2. Define routes with `craftRoute` and collect them with `craftRoutes`

Do not export a plain Angular `Routes` array directly. Define each typed route with
`craftRoute(...)`, collect them with `craftRoutes(...)`, and declare `componentDeps` on each route
component.

::: warning Breaking rename
The former `route(...)` helper has been renamed to `craftRoute(...)`. There is no compatibility alias:
update both the import and every call site.
:::

```ts
import { craftRoute, craftRoutes } from '@craft-ng/core';

export const { appRoutes } = craftRoutes('app', [
  craftRoute('', {
    loadComponent: ({ withRetry }) => withRetry(import('./test')),
    componentDeps: {} as import('./test').GenDeps_TestComponent,
  }),
]);
```

The important part is:

```ts
componentDeps: {} as import('./test').GenDeps_TestComponent,
```

That line connects the generated `GenDeps_*` type of the component to the same-file cascade check.

### Prefer the route CLI for day-to-day authoring

The CLI is the primary writing façade while the generated result remains ordinary editable TypeScript:

```bash
npx craft route add
npx craft route add /users/:userId --component src/app/users/user-detail.ts#UserDetailComponent
npx craft route add /users/:userId --create-component users/user-detail
```

By default it detects the Angular project and `craftRoutes` collections, creates one lazy routes file
per feature, adds `componentDeps`, `withRetry`, `.withParent`, the parent mount assertion and the
same-file DI check, then runs ESLint and TypeScript diagnostics. Use `--dry-run` to inspect the plan,
`--yes` for non-interactive scripts and `--json` for machine-readable output.

Static redirects stay in the selected collection:

```bash
npx craft route add /old-users --redirect-to /users --parent src/app/app.routes.ts#appRoutes
```

Existing flat groups can be split explicitly:

```bash
npx craft route split \
  --parent src/app/app.routes.ts#appRoutes \
  --prefix users \
  --target src/app/users/users.routes.ts
```

The split command only moves statically analyzable routes. It reports local declarations or dynamic
paths without mutating files, so business logic is never guessed.

Then wire the crafted routes into your application config:

```ts
import { craftAppConfig } from '@craft-ng/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { appRoutes } from './app.routes';

export const appConfig = craftAppConfig({
  routingDeps: appRoutes.META_DATA,
  providers: [provideRouter(appRoutes.toRoutes(), withComponentInputBinding())],
});
```

Notes:

- `appRoutes.toRoutes()` gives Angular the real runtime routes.
- `appRoutes.META_DATA` gives `craftAppConfig(...)` the compile-time route dependency graph.
- For **non-blocking navigation** (immediate URL commit, pending UI, centralised exception
  handling), render `CraftRouterOutlet()` from `@craft-ng/component` inside a
  Craft component tree instead of `<router-outlet>`, and use
  `provideCraftRouter(...)` instead of `provideRouter(...)` — it accepts Angular router features
  **and** craft loading features (`withErrorComponent`, `withRouteLoadError`,
  `withTransitionTimings`, …) in one call,
  e.g. `provideCraftRouter(appRoutes.toRoutes(), withComponentInputBinding(), withErrorComponent({ component: MyGlobalErrorScreen, componentDeps }))`.
  (The features also work standalone via `provideCraftLoading(...)`.)
  `withRouteLoadError(...)` must stay in `provideCraftRouter(...)` because it also registers an
  Angular navigation error handler and an internal recovery route. See
  [Non-blocking navigation & pending UI](./pending-ui.md) and
  [Route Load Errors](./route-load-errors.md).
- For lazy routes, `loadChildren` should return the named route tree exported by the child collection, for example `childRoutes.childRoutes`.

### Large route files — the cascade DI depth limit

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
add one**, so re-declare the check in the child file to keep DI sound:

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
Injected SomeService is not provided in path: ""
```

If a single feature is itself large, repeat the split, or break one big collection into several
`craftRoutes(...)` collections each with its own check — every check then validates a smaller slice
and stays under the depth limit. The takeaway: **DI is always verified — never drop the check; move
it next to the routes it covers.**

#### Why the budget exists (the mechanism)

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

### Scaling to hundreds of routes

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

#### Escape hatch — the `O(1)`-per-route check

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

### Pinning a lazy child to its mount path (`.withParent` + `assertChildRouteMounts`)

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

## 3. Run the Angular brand codemod through the published script

Add a script in your app:

```json
{
  "scripts": {
    "craft:brand": "craft-brand --root src/app"
  }
}
```

Then run:

```bash
npm run craft:brand
```

This is the step that creates the initial `GenDeps_*` aliases in your component files, for example:

```ts
export type GenDeps_TestComponent = GetDeps<{
  deps: {
    CommonModule: CommonModule;
    Counter: GetInjectedServiceDependencies<typeof injectCounter>;
  };
  provided: {};
  publicProperties: GetPublicComponentProperties<TestComponent>;
}>;
```

Adjust `--root` to your real source root:

- `src/app` for a standard Angular app
- `projects/my-app/src/app` for a workspace app
- `libs/my-feature/src` for a library

If you use a project-level `craft-brand.config.ts`, you can extend the script:

```json
{
  "scripts": {
    "craft:brand": "craft-brand --root src/app --config ./craft-brand.config.ts"
  }
}
```

## 4. Install the exposed ESLint rules

The plugin is exposed from `@craft-ng/dev-tools/eslint-rules`.

Add it to your ESLint flat config:

```ts
import craftRules from '@craft-ng/dev-tools/eslint-rules';

export default [
  // keep your existing ESLint config entries
  {
    files: ['**/*.ts'],
    plugins: {
      'craft-ng': craftRules,
    },
    rules: {
      'craft-ng/brand-angular-gen-deps-required': 'error',
      'craft-ng/brand-angular-deps-match': 'error',
      'craft-ng/component-test-gen-deps-match': 'error',
      'craft-ng/no-angular-inject': 'error',
      'craft-ng/prefer-craft-service': 'error',
      'craft-ng/prefer-craft-http-client': 'error',
      'craft-ng/require-assert-exhaustive-route-exceptions': 'error',
      'craft-ng/require-craft-exception-handler': 'error',
      'craft-ng/require-exception-component-di-check': 'error',
      'craft-ng/require-pending-component-di-check': 'error',
      'craft-ng/require-child-route-mount-check': 'error',
      'craft-ng/require-lazy-load-with-retry': 'error',
      'craft-ng/require-cascade-route-di-check': 'error',
      'craft-ng/global-exception-registry-match': 'error',
    },
  },
];
```

What each rule does:

- `craft-ng/brand-angular-gen-deps-required`: generates a missing `GenDeps_*` alias for Angular components, directives, and pipes through the ESLint Quick Fix
- `craft-ng/brand-angular-deps-match`: keeps existing `GenDeps_*` aliases in sync through the same ESLint Quick Fix flow
- `craft-ng/component-test-gen-deps-match`: checks `setupCraftComponentTestingByRegister(Component, {} as GenDeps_Component, ...)` pairs in tests
- `craft-ng/no-angular-inject`: forbids raw Angular `inject()` usage so dependencies go through `craftService(...)` or `toCraftService(...)`
- `craft-ng/prefer-craft-service`: forbids authored Angular `@Injectable()` / `@Service()` services in favor of `craftService(...)` and `toCraftService(...)`
- `craft-ng/prefer-craft-http-client`: forbids Angular `HttpClient` usage in favor of `CraftHttpClient`
- `craft-ng/require-assert-exhaustive-route-exceptions`: adds the collection-level `assertExhaustiveRouteExceptions(...)` safety net
- `craft-ng/require-craft-exception-handler`: enforces `craftExceptionHandler(function* (...) {})`; simple handlers are autofixed and ambiguous raw redirects are reported for manual migration
- `craft-ng/require-exception-component-di-check`: generates O(1) `RouteExceptionComponentCheckedDI` checks for `renderComponent`, route-level `errorComponent`, `withErrorComponent`, `withRouteLoadError`, and route-local `provideRouteLoadErrorComponent`
- `craft-ng/require-pending-component-di-check`: generates the independent `RouteCheckedDI` check for each `pendingComponent`
- `craft-ng/require-child-route-mount-check`: adds the missing `assertChildRouteMounts(...)` call + import (Quick Fix) for any `craftRoutes(...)` collection that mounts lazy `loadChildren`, so a `.withParent`-pinned child mounted under the wrong path is a compile error
- `craft-ng/require-lazy-load-with-retry`: wraps route `loadComponent` and `loadChildren` imports with the generated `withRetry(...)` loader helper while preserving a statically analyzable import specifier
- `craft-ng/require-cascade-route-di-check`: rejects any `craftRoutes(...)` collection without a same-file `ValidateCascadeRoutesFile + CanRun` proof; its autofix adds the conservative `<never, Router>` context, which should be adjusted when the mount inherits providers
- `craft-ng/global-exception-registry-match`: keeps `CraftGlobalExceptionRegistry` synchronized with handlers delegating to `globalError()`

The two migration rules also expose a VS Code ESLint Quick Fix suggestion that inserts a temporary local disable comment with the intended migration note when you need to unblock a file before doing the full refactor.

If your project is adopting this progressively, enable both `craft-ng/brand-angular-gen-deps-required` and `craft-ng/brand-angular-deps-match` so the same Quick Fix can generate missing aliases and refresh existing ones. `craft-ng/no-angular-inject` is an architecture-enforcement rule and may require a broader migration.

## 5. When a component changes, regenerate `GenDeps` with the Quick Fix

After changing a component's DI-related shape, refresh its generated alias.

Typical triggers:

- adding or removing `inject(...)`
- changing constructor injection
- changing component `imports`
- changing `providers`
- changing `viewProviders`

Recommended workflow:

- first generation or bulk refactor: `npm run craft:brand`
- one file without `GenDeps_*`: trigger the VS Code ESLint Quick Fix on `craft-ng/brand-angular-gen-deps-required`
- one file with `GenDeps_*`: trigger the VS Code ESLint Quick Fix on `craft-ng/brand-angular-deps-match`
- CLI alternative for one file: `eslint --fix src/app/feature/my-component.ts`

Important limits:

- the Quick Fix only handles the current file
- if you rename the component class, rerun the generator so the `GenDeps_*` alias name stays aligned

:::warning
An Eslint error does not trigger a compilation error, so make sure to run the Quick Fix or `eslint --fix` after changing a component's DI shape. Otherwise, `main.ts` will not see the updated `GenDeps_*` and may miss real DI errors.
:::

## See Also

- [`Route Guards`](./guards.md)
- [`Centralised Exception Handling`](./exception-handling.md)
- [`Non-blocking Navigation & Pending UI`](./pending-ui.md)
- [`Global Error Component`](./global-error-component.md)
- [`Route Load Errors`](./route-load-errors.md)
- [`Angular Brand Config`](/type-safe-di-routes/angular-brand-config)
- [`craftService`](/store/craft-service)
- [`toCraftService`](/store/to-craft-service)
