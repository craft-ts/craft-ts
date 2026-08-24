# Per-file DI checks

## What the check does

`ValidateCascadeRoutesFile<ParentNames, ParentValues, typeof xRoutes>` walks every route in the
collection at the type level and, for each routed component, compares the dependencies it injects
(`componentDeps` → its `GenDeps_*`) against what is provided — the route's own auto-provided services
(params, `data`, `queryParams`, guarded/resolved data), the route `providers`, and the **parent context**
you pass in. Any gap becomes a TypeScript error on `_CanRun*`:

```
Injected SomeService is not provided in path: "some/path"
Input "userId" is not provided in path: "some/path"
```

`CanRun<Check>` is what turns the check result into a hard compile error — always pair them:

```ts
type _CheckXDI = ValidateCascadeRoutesFile<ParentNames, ParentValues, typeof xRoutes>;
type _CanRunX = CanRun<_CheckXDI>;
```

## The iron rule (why every file needs its own)

The check reads only the **current** collection's metadata. It does **not** descend into `loadChildren`.
So a lazy child loaded from another file is invisible to the parent's check — that child file must
declare its own, or its components are never verified. This is the single most common way DI safety
silently disappears.

```
app.routes.ts          → ValidateCascadeRoutesFile<…, typeof appRoutes>     (checks its own leaves)
└── loadChildren → feature.routes.ts → ValidateCascadeRoutesFile<…, typeof featureRoutes>  (MUST have its own)
```

## Threading the parent DI context

`ParentNames` / `ParentValues` describe everything provided **at the collection's mount point** — app
providers **plus** every ancestor route's `providers`.

- **App-level / no ancestor providers** (the common case): `<never, Router>`. No extra named providers;
  `Router` is provided by value via `provideCraftRouter` / `provideRouter`. This pair is identical in
  every file mounted directly under the app.

  ```ts
  type _Check = ValidateCascadeRoutesFile<never, Router, typeof featureRoutes>;
  ```

- **Mounted under a route that adds `providers: [provideBilling()]`**: re-export the ancestor's cumulative
  context next to the route that adds it, and union your own onto it:

  ```ts
  // billing.routes.ts
  export type BillingChildNames  = AppProvidedNames | 'BillingService';
  export type BillingChildValues = AppProvidedValues;

  // sub-billing.routes.ts
  type _Check = ValidateCascadeRoutesFile<BillingChildNames, BillingChildValues, typeof subRoutes>;
  ```

Forgetting to fold in an ancestor's provider makes the check wrong in **both** directions: a genuinely
missing provider can slip through, or a provided service gets flagged as missing. Keep the re-export
beside the route that adds the providers.

> Note: deriving the names automatically (e.g. `AppProvidedServiceNamesOf<typeof appConfig>`) can itself
> hit TS2589 when app providers are complex (function wrappers, monitoring, …). Listing the value types
> explicitly (`<never, Router, …>`) is the reliable workaround.

## The `RouteCheckedDI` escape hatch (O(1) per route)

When a single file genuinely must hold a large **flat** list with no natural `loadChildren` boundary,
switch from the aggregated cascade to the per-route check. It validates one component at a time with **no
recursion between routes**, so it never hits the depth ceiling and scales to thousands of routes — at the
cost of one block per component instead of one per file:

```ts
import { type CanRun, type RouteCheckedDI } from '@craft-ts/core';

type _CheckItem0 = RouteCheckedDI<
  import('./item-0').GenDeps_Item0Component,
  AppProvidedNames,   // available provider names (parent context)
  AppProvidedValues,  // provided value types
  'Item0Component'    // label shown in the error
>;
type _CanRunItem0 = CanRun<_CheckItem0>;
// …one pair per route component
```

Prefer the `loadChildren` tree (it also code-splits); reach for `RouteCheckedDI` only when one big flat
file is unavoidable — or to verify a component the cascade can't see, like a `pendingComponent`.

## `GenDeps_*` — keep it fresh

`componentDeps: {} as import('./x').GenDeps_X` points at a generated alias describing the component's DI
shape. It is **generated, not hand-written**. Regenerate it whenever the component's DI changes:

- adding/removing `inject(...)` or constructor injection
- changing component `imports`, `providers`, or `viewProviders`

Use the ESLint Quick Fix (`brand-angular-gen-deps-required` to create, `brand-angular-deps-match` to
refresh) or the project's `craft:brand` codemod. A stale `GenDeps_*` makes the route check validate the
wrong shape — so after regenerating it, re-run ESLint `--fix` on the routes file.
