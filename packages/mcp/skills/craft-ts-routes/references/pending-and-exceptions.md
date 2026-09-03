# Pending UI, view transitions & exhaustive exceptions

## Non-blocking navigation + pending component

With `<craft-router-outlet>` (wired via `provideCraftRouter(...)`) navigation is non-blocking: the URL
commits immediately, a `pendingComponent` (skeleton) shows while a slow guard/resolve chain is in flight,
and the target mounts only on success. Add one per route as a craft-only field:

```ts
route('user/:userId', {
  componentDeps: {} as import('./user').GenDeps_UserComponent,
  loadComponent: () => import('./user'),
  pendingComponent: () => import('./user-skeleton'),
  canActivate: craftCanActivate(/* slow guard */),
}),
```

### Verifying the skeleton's DI

The skeleton is a real component that injects things (route params, a payload, monitoring), so verify it
independently with the per-component `RouteCheckedDI`:

```ts
// The skeleton injects the route-auto-provided :userId param — list its service name as available.
type _CheckPendingDI = RouteCheckedDI<
  import('./user-skeleton').GenDeps_UserSkeletonComponent,
  'UserUserIdParams',     // route-auto-provided names the skeleton may inject
  AppValues,              // same parent context the cascade uses
  'pending component: user/:userId'
>;
type _CanRunPending = CanRun<_CheckPendingDI>;
```

The ESLint rule `require-pending-component-di-check` **generates and refreshes this whole block** on
`--fix` — deriving the skeleton's `GenDeps_*`, the auto-provided service names from the route's path params
(+ view-transition payload), and the parent context. Don't hand-maintain it.

## View transitions (shared-element morph across a slow chain)

For a shared-element morph to survive a slow navigation, the route **declares the payload shape** with
`viewTransitionPayload<T>()` — the view-transition analogue of how `queryParams` declares query-params shape:

```ts
export const { photosRoutes, injectPhotosPhotoIdViewTransition } = craftRoutes('photos', [
  route(':photoId', {
    componentDeps: {} as import('./photo-detail').GenDeps_PhotoDetailComponent,
    loadComponent: () => import('./photo-detail'),
    withLoaderViewTransitionImage: viewTransitionPayload<{ name: string; image: string | null }>(),
    pendingComponent: () => import('./photo-skeleton'),
  }),
]).withParent<ParentRoutes<'photos'>>();
```

This makes a typed `viewTransition: T | null` **required** on every `craftRouterLink` / `navigate` targeting
the route, and exposes a route-generated `injectPhotosPhotoIdViewTransition(): Signal<T | null>` helper the
skeleton/target reads to wear the matching `view-transition-name`. Use `withCraftViewTransitions()` (not
Angular's `withViewTransitions()`) so the morph is driven by the outlet's own swaps. The payload travels in
navigation `state`, so it is lost on reload/direct URL — the app stays functional without the preview image.

## Exhaustive exception handling

A route whose `canActivate` / `canMatch` / `resolve` can short-circuit with a typed `craftException({ code })`
must handle exactly those codes — no missing, no extra. Two equivalent ways:

- **3-arg `route(path, def, handlers)`** — enforces exhaustiveness at the call site:

  ```ts
  route(':photoId', {
    canActivate: craftCanActivate(/* may craftException({ code: 'DENIED' }) */),
    // …
  }, {
    DENIED: ({ redirect }) => redirect('/photos'),
  }),
  ```

- **`handleExceptions` field + a collection-level assert** as a safety net for 2-arg routes:

  ```ts
  assertExhaustiveRouteExceptions(photosRoutes);
  ```

  A route that can throw but was written with the 2-arg form surfaces its unhandled codes here. The ESLint
  rule `require-assert-exhaustive-route-exceptions` adds this assert (+ import) on `--fix`.

Handlers receive helpers like `redirect('/path')` and `globalError()` (delegates to the global error
component). Codes routed to `globalError()` are mirrored in the `CraftGlobalExceptionRegistry` augmentation
by the `global-exception-registry-match` ESLint autofix — don't edit that by hand either.
