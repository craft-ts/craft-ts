# Non-blocking navigation

By default, a slow guard or resolver freezes the app on the previous page with no
feedback. `CraftRouterOutlet()` inverts that: the URL commits immediately and a
pending component appears only if the wait is actually noticeable.

**Use it when** guards or resolvers do real work — an HTTP call, a permission
check.
**Not when** everything resolves synchronously; `<router-outlet>` is fine then.

`CraftRouterOutlet()` replaces `<router-outlet>` with **non-blocking** navigation :
the URL commits immediately, a pending component appears only if the guard/resolve chain is slow,
and the target component is mounted **only on success** — never while an exception is being
resolved.

## Setup

Call the outlet inside a Craft component tree:

<<< @/tests/snippets/guide/routing/pending-ui/app.spec.ts#app


Routes with no craft guard/resolve render immediately, exactly like `<router-outlet>`.

## Lifecycle

For a route with a craft chain, on navigation the outlet lets the URL commit immediately (no
blocking guard), then runs **three phases** while the chain is in flight — so a fast navigation
never flashes a blank screen or a loader:

1. **stay** — for `stayMs` (default `300`) the **previous page is kept on screen**. The chain runs
   in the background; if it settles within this window, the outlet transitions **straight to the
   target** (no blank, no loader);
2. **blank** — for the next `blankMs` (default `300`), a **blank** surface, signalling the page is
   changing;
3. **pending** — the **pending component** (loader) is shown until the chain settles.

On success the outlet writes the resolved data and mounts the **target**; on exception it applies
the route's [`handleExceptions`](/guide/concepts/exceptions) outcome.

Lazy JavaScript load failures (`loadComponent` / `loadChildren`) happen before the outlet can mount
the target route. Configure [`withRouteLoadError`](/guide/routing/route-load-errors) to retry those failures
and render a recovery screen while keeping the browser URL on the intended route. A slow JavaScript
download or retry does not currently activate this pending timeline; dedicated loading UI for that
earlier phase is a planned evolution.

```
click → URL committed
 ├─ 0 → stayMs ........ PREVIOUS page kept          ─(resolved)─▶ target
 ├─ stayMs → +blankMs . BLANK page                  ─(resolved)─▶ target
 └─ beyond ............ LOADER (min pendingMinMs)    ─(resolved / redirect)─▶ target / redirect
```

`pendingMinMs` adds anti-flicker: once the loader is shown, it stays visible for at least that long,
so a chain that settles right after it appears does not blink it in and out.

The previous page is kept **alive** (not re-created) during `stay`: the outlet renders through a
single component slot it leaves untouched until the phase changes, so the old component instance
keeps its state for the duration of the window.

## Configuration

The loading/error features are plain feature objects (like Angular's
`withComponentInputBinding()`). The recommended place for them is **directly in
`provideCraftRouter(...)`**, mixed with Angular's own router features — they are
split apart internally and routed to `provideRouter` / `provideCraftLoading`:

```ts
provideCraftRouter(
  appRoutes.toRoutes(),
  withComponentInputBinding(),                     // Angular router feature
  withCraftViewTransitions(),                       // craft loading feature (see below)
  withErrorComponent({
    component: MyGlobalErrorScreen,
    componentDeps: {} as import('./global-error').GenDeps_MyGlobalErrorScreen,
  }),
  withRouteLoadError({
    component: MyRouteLoadErrorScreen,
    componentDeps:
      {} as import('./route-load-error').GenDeps_MyRouteLoadErrorScreen,
    retry: { attempts: 1, delayMs: 250 },
  }),
  withTransitionTimings({ stayMs: 300, blankMs: 300, pendingMinMs: 500 }),
  withLoadingText(() => computed(() => translate('common.loading'))),
  withPendingComponent(MyBrandedSpinner),
),
```

Most loading features still work standalone via `provideCraftLoading(...)` if you prefer to keep them
in a separate provider. Keep `withRouteLoadError(...)` in `provideCraftRouter(...)`: it also
registers an Angular navigation error handler and an internal recovery route.

```ts
provideCraftLoading(
  withTransitionTimings({ stayMs: 300, blankMs: 300, pendingMinMs: 500 }),
  withLoadingText(() => computed(() => translate('common.loading'))),
  withPendingComponent(MyBrandedSpinner),
  withErrorComponent({
    component: MyGlobalErrorScreen,
    componentDeps: {} as import('./global-error').GenDeps_MyGlobalErrorScreen,
  }),
),
```

| Feature                    | Token                                                                 | Default                           |
| -------------------------- | --------------------------------------------------------------------- | --------------------------------- |
| `withPendingComponent`     | `CRAFT_PENDING_COMPONENT`                                             | `DefaultCraftPendingComponent`    |
| `withLoadingText`          | `CRAFT_LOADING_TEXT`                                                  | locale-aware (en/fr, fallback en) |
| `withTransitionTimings`    | `CRAFT_STAY_MS` / `CRAFT_BLANK_MS` / `CRAFT_PENDING_MIN_MS`           | `300` / `300` / `0`               |
| `withErrorComponent`       | `CRAFT_ERROR_COMPONENT`                                               | `null`                            |
| `withRouteLoadError`       | `CRAFT_ROUTE_LOAD_ERROR_COMPONENT` / `CRAFT_ROUTE_LOAD_RETRY`         | `null` / one retry after 250 ms   |
| `withCraftViewTransitions` | `CRAFT_VIEW_TRANSITIONS_ENABLED` / `CRAFT_VIEW_TRANSITION_SKIP_BLANK` | `false` / `false`                 |
| `withA11yNavigationFocus`  | `CRAFT_A11Y_NAVIGATION_FOCUS`                                         | `false`                           |

The default pending component renders `CRAFT_LOADING_TEXT`, which reads `LOCALE_ID` and picks a
built-in translation (`Loading…` / `Chargement…`).

## Per-route overrides

Any route may override the defaults via craft-only fields (stripped from the emitted Angular
`Route`):

```ts
craftRoute('user/:userId', {
  // …
  stayMs: 150,        // shorten the "keep previous page" window
  blankMs: 0,         // skip the blank phase → straight to loader
  pendingComponent: () => import('./user-skeleton'),
  // reactiveGuards: false, // opt out of live guards (on by default)
}),
```

## View Transitions

Angular's `withViewTransitions()` brackets **only the synchronous URL commit** in
`document.startViewTransition()`. With the non-blocking outlet that is the wrong instant: the target
component mounts **after** the guard/resolve chain settles, so a shared-element morph captures
`previous page → (stay/loader)` and the real `previous → target` morph is lost — worse, a full-screen
loader becomes the captured "old" frame.

`withCraftViewTransitions()` hands the morph to the **outlet** instead: it drives
`document.startViewTransition()` around its **own** swaps (`previous page → skeleton → target`), so the
morph survives even a slow chain. It guards `prefers-reduced-motion`, falls back to a plain swap when
the API is missing, and is overridable in tests via the `CRAFT_START_VIEW_TRANSITION` seam.

```ts
provideCraftRouter(
  appRoutes.toRoutes(),
  withCraftViewTransitions(), // replaces Angular's withViewTransitions()
),
```

### Shared element across a slow chain

For the morph to bridge a slow navigation, **something** carrying the shared element's
`view-transition-name` must stay on screen while the chain runs — the **pending skeleton**. A route
opts in by **declaring the shared-element payload shape** with `viewTransitionPayload<T>()` — the
view-transition analogue of how `queryParams` declares a route's query-params shape. This:

- makes a typed `viewTransition: T | null` payload **required** on every `craftRouterLink` / `navigate`
  targeting it (`null` is an explicit opt-out);
- exposes a route-generated, fully-typed `injectXxxViewTransition(): Signal<T | null>` helper;
- tells the outlet to **skip the blank phase** (a blank would break the morph): `stay → pending → loaded`.

```ts
export const { photosRoutes, injectPhotosPhotoIdViewTransition } = craftRoutes(
  'photos',
  [
    craftRoute(
      ':photoId',
      {
        componentDeps:
          {} as import('./photo-detail').GenDeps_PhotoDetailComponent,
        loadComponent: ({ withRetry }) => withRetry(import('./photo-detail')),
        withLoaderViewTransitionImage: viewTransitionPayload<{
          name: string;
          image: string | null;
        }>(),
        pendingComponent: () => import('./photo-skeleton'),
        // The skeleton's DI is verified separately (see "Verifying the skeleton's DI").
        canActivate: function* () {
          /* slow guard */
        },
      },
      {
        /* … */
      },
    ),
  ],
).withParent<ParentRoutes<'photos'>>();
```

This collection is a lazy child mounted via `loadChildren` (kept out of the parent's cascade DI budget).
Because its components depend on the `:photoId` param **and** the declared view-transition payload, it is
only correct under the `photos` route — so it is **pinned** to that mount with
`.withParent<ParentRoutes<'photos'>>()`, and the parent enforces it with `assertChildRouteMounts(...)`.
See [Pinning a lazy child to its mount path](/guide/routing/setup#pinning-a-lazy-child-to-its-mount-path-withparent-assertchildroutemounts).

The link passes a payload of the **declared type** (required, and shape-checked):

```ts
[craftRouterLink]="{
  to: 'photos/:photoId',
  params: { photoId: photo.id },
  viewTransition: { name: 'photo-' + photo.id, image: photo.preview },
}"
```

The skeleton (and/or the target) reads it through the **route-generated typed helper** and wears the
matching `view-transition-name`:

```ts
export default class PhotoSkeleton {
  protected readonly photoId = injectPhotosPhotoIdParams();
  // Signal<{ name: string; image: string | null } | null> — typed by the route.
  private readonly viewTransition = injectPhotosPhotoIdViewTransition();
  protected readonly image = computed(
    () => this.viewTransition()?.image ?? null,
  );
  // template: <span [style.view-transition-name]="'photo-' + photoId()"> … </span>
}
```

> The global, untyped `injectCraftViewTransition(): Signal<unknown>` still exists for ad-hoc reads, but
> prefer the route-generated helper when you have a declared payload.

The payload travels in Angular's navigation `state`, so it is **lost on reload or direct URL access**
— there is no previous page to morph from in that case anyway; the app stays functional (skeleton
without the preview image, then the target). Pass `withCraftViewTransitions({ skipBlank: true })` to
skip the blank phase for **every** route, not just opted-in ones.

### Verifying the skeleton's DI

The pending skeleton is a real component that injects dependencies (route params, the typed payload,
monitoring, …), but the aggregated cascade (`ValidateCascadeRoutesFile`) only sees the **target**
component — it never descends into `pendingComponent`. So the skeleton is verified **directly**, with
the per-component, O(1) [`RouteCheckedDI`](/guide/routing/setup#escape-hatch-the-o-1-per-route-check) escape
hatch (not a second aggregated pass — that would add to the instantiation-count budget the cascade is
already spending):

```ts
type _CheckTargetDI = ValidateCascadeRoutesFile<
  AppNames,
  AppValues,
  typeof photosRoutes
>;
type _CanRunTarget = CanRun<_CheckTargetDI>;

// The skeleton injects the `:photoId` param and the typed payload — both
// auto-provided by the route, so list those service names as available; the
// parent context (`AppValues` here) is the same one the cascade check uses.
type _CheckPendingDI = RouteCheckedDI<
  import('./photo-skeleton').GenDeps_PhotoSkeletonComponent,
  'PhotosPhotoIdParams' | 'PhotosPhotoIdViewTransition',
  AppValues,
  'pending component: photos/:photoId'
>;
type _CanRunPending = CanRun<_CheckPendingDI>;
```

A service the skeleton injects but nothing provides becomes a TypeScript error on `_CanRunPending`
(`The X service is not provided in pending component: photos/:photoId`). The
`craft-ts/require-pending-component-di-check` ESLint rule **generates and refreshes this whole block**
from `pendingComponent` on `--fix` — resolving the skeleton's `GenDeps_*`, deriving the auto-provided
service names from the route's path params + payload, and borrowing the parent context from the
collection's own `ValidateCascadeRoutesFile` — so you never hand-write or stale it.

[Architecture tests](/guide/testing/architecture#assertroutediproofs) (`assertRouteDiProofs`) fail
if that pending proof is missing or not armed with `CanRun`.

## See Also

- [Route exception handling](/guide/routing/exception-handling)
- [Route guards](/guide/routing/guards) — what the outlet is waiting on
- [Global error component](/guide/routing/global-error-component)
- [Architecture rules](/guide/testing/architecture) — `assertRouteDiProofs` keeps the pending-component proof armed
