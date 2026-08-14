# Routing setup

Six steps turn Angular's routes into routes the compiler checks: a missing
provider, a misspelled input or a route pointing at nothing becomes a build
error instead of a blank screen. Architecture tests then keep those proofs
from quietly disappearing.

**Do this once per app**, then let [the CLI](/guide/routing/automation) write
new routes for you.

This guide assumes you are integrating type-safe DI/routes into an Angular app that consumes `@craft-ng/core`.

::: tip Prefer the guided version
[Learn step 9](/learn/09-routing) walks through the same setup on a single
route, with the reasoning attached.
:::

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

- `The Counter service is not provided in path: "some-path"`
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
  [Non-blocking navigation & pending UI](/guide/routing/pending-ui) and
  [Route Load Errors](/guide/routing/route-load-errors).
- For lazy routes, `loadChildren` should return the named route tree exported by the child collection, for example `childRoutes.childRoutes`.

### When a routes file gets big

The cascade check has a per-file budget, and past it TypeScript reports
`TS2589` and silently degrades inference in the whole file. The fix is to split
into lazy child collections, each with its own check — see
**[Scaling routes](/guide/routing/scaling)**.

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
    Counter: GetServiceDependencies<typeof Counter>;
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

## 4. Install the ESLint rules

Several checks in this guide rely on code a rule generates or keeps in sync —
`GenDeps_*` aliases, the same-file DI proof, the exhaustiveness assert. Others
enforce the architecture itself.

Installing the plugin and the rule list is its own page:
**[ESLint rules](/guide/routing/eslint-rules)**.

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

## 6. Make the DI contract enforceable

The proofs in this guide are unused type aliases unless they stay in the file:
comment out a `CanRun` and the project still compiles. That is the one fragile
step in an otherwise compile-time guarantee.

Architecture tests close it. `assertRouteDiProofs` walks the static graph and
fails unless every routed component — including lazy `loadChildren`
collections — every pending or error screen, and every `craftAppConfig` error
surface is hooked to an armed mapper. TypeScript still judges whether a
dependency is provided; the architecture suite judges whether that judgement
was invoked.

Copy the demo layout (`apps/demo/architecture/`) and add:

```typescript
it('requires a DI proof on every routed component and app-config error screen', () => {
  assertRouteDiProofs(graph.graph);
});
```

Full setup — analysis tsconfig, catalog, Nx target — is on
[Architecture rules](/guide/testing/architecture).

## See Also

- [CLI automation](/guide/routing/automation) — let the CLI write routes for you
- [Architecture rules](/guide/testing/architecture) — `assertRouteDiProofs` keeps the proofs armed
- [Route guards](/guide/routing/guards) — the next thing you'll add
- [Scaling routes](/guide/routing/scaling) — when one routes file gets too big
