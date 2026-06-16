# Non-blocking Navigation & Pending UI

`CraftRouterOutlet` replaces `<router-outlet>` with **non-blocking** navigation :
the URL commits immediately, a pending component appears only if the guard/resolve chain is slow,
and the target component is mounted **only on success** — never while an exception is being
resolved.

## Setup

Use the outlet wherever you would use `<router-outlet>`:

```ts
import { CraftRouterOutlet } from '@craft-ng/core';

@Component({
  imports: [CraftRouterOutlet /* … */],
  template: `<craft-router-outlet></craft-router-outlet>`,
})
export class App {}
```

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
the route's [`handleExceptions`](./exception-handling.md) outcome.

```
clic → URL committée
 ├─ 0 → stayMs ........ page PRÉCÉDENTE conservée   ─(résolu)─▶ cible
 ├─ stayMs → +blankMs . page BLANCHE                ─(résolu)─▶ cible
 └─ au-delà ........... LOADER (min pendingMinMs)   ─(résolu / redirect)─▶ cible / redirect
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
  withErrorComponent(MyGlobalErrorScreen),         // craft loading feature
  withTransitionTimings({ stayMs: 300, blankMs: 300, pendingMinMs: 500 }),
  withLoadingText(() => computed(() => translate('common.loading'))),
  withPendingComponent(MyBrandedSpinner),
),
```

The same features still work standalone via `provideCraftLoading(...)` if you
prefer to keep them in a separate provider:

```ts
provideCraftLoading(
  withTransitionTimings({ stayMs: 300, blankMs: 300, pendingMinMs: 500 }),
  withLoadingText(() => computed(() => translate('common.loading'))),
  withPendingComponent(MyBrandedSpinner),
  withErrorComponent(MyGlobalErrorScreen),
),
```

| Feature                 | Token                                                    | Default                           |
| ----------------------- | -------------------------------------------------------- | --------------------------------- |
| `withPendingComponent`  | `CRAFT_PENDING_COMPONENT`                                | `DefaultCraftPendingComponent`    |
| `withLoadingText`       | `CRAFT_LOADING_TEXT`                                     | locale-aware (en/fr, fallback en) |
| `withTransitionTimings` | `CRAFT_STAY_MS` / `CRAFT_BLANK_MS` / `CRAFT_PENDING_MIN_MS` | `300` / `300` / `0`             |
| `withErrorComponent`    | `CRAFT_ERROR_COMPONENT`                                  | `null`                            |
| `withCraftViewTransitions` | `CRAFT_VIEW_TRANSITIONS_ENABLED` / `CRAFT_VIEW_TRANSITION_SKIP_BLANK` | `false` / `false`      |

The default pending component renders `CRAFT_LOADING_TEXT`, which reads `LOCALE_ID` and picks a
built-in translation (`Loading…` / `Chargement…`).

## Per-route overrides

Any route may override the defaults via craft-only fields (stripped from the emitted Angular
`Route`):

```ts
route('user/:userId', {
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
opts in with `withLoaderViewTransitionImage: true`, which:

- makes a `viewTransition` payload **required** on every `craftRouterLink` / `navigate` targeting it
  (`{ name; image? } | null`, where `null` is an explicit opt-out);
- tells the outlet to **skip the blank phase** (a blank would break the morph): `stay → pending → loaded`.

```ts
route(':photoId', {
  loadComponent: () => import('./photo-detail'),
  withLoaderViewTransitionImage: true,
  pendingComponent: () => import('./photo-skeleton'),
  canActivate: craftCanActivate(/* slow guard */),
  handleExceptions: { /* … */ },
}),
```

The link passes the payload (required by the type system):

```ts
[craftRouterLink]="{
  to: 'photos/:photoId',
  params: { photoId: photo.id },
  viewTransition: { name: 'photo-' + photo.id, image: photo.preview },
}"
```

The skeleton and the target read it with `injectCraftViewTransition()` and wear the matching
`view-transition-name`:

```ts
export default class PhotoSkeleton {
  protected readonly photoId = injectPhotoIdParams();
  private readonly viewTransition = injectCraftViewTransition();
  protected readonly image = computed(() => this.viewTransition()?.image ?? null);
  // template: <span [style.view-transition-name]="'photo-' + photoId()"> … </span>
}
```

The payload travels in Angular's navigation `state`, so it is **lost on reload or direct URL access**
— there is no previous page to morph from in that case anyway; the app stays functional (skeleton
without the preview image, then the target). Pass `withCraftViewTransitions({ skipBlank: true })` to
skip the blank phase for **every** route, not just opted-in ones.
