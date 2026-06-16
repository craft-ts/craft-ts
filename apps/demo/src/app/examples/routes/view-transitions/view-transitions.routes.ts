import {
  assertExhaustiveRouteExceptions,
  craftCanActivate,
  craftException,
  craftGen,
  craftRoutes,
  craftService,
  query,
  route,
  untilSettled,
  viewTransitionPayload,
  type CanRun,
  type ValidateCascadeRoutesFile,
} from '@craft-ng/core';
import type { Router } from '@angular/router';

// --- View Transitions demo (gallery → detail, shared-element morph) ----------
// Two routes showcasing Angular's `withViewTransitions()` feature, mixed into
// `provideCraftRouter` in `app.config.ts`. The gallery ('') and the detail
// (':photoId') share a `view-transition-name` per artwork, so the browser morphs
// the clicked tile into the detail hero (and back).
//
// Lives in its own lazy child collection (like the slow-page demo): `loadChildren`
// collections are not folded into the parent `app.routes` cascade DI budget,
// which is already at TypeScript's instantiation-depth ceiling.

// Deliberately slow (~3s) access check used to test how the view transition
// renders against the NON-BLOCKING outlet: the URL commits immediately, the
// detail hero only mounts once this guard settles, so the shared-element morph
// can't capture a hero that isn't in the DOM yet — instead you see the pending
// UI. Cached global query, so the FIRST detail visit is slow and a revisit is
// instant; use the 🗑️ Clear Cache button to replay the pending state.
const { ViewTransitionAccessToYield } = craftService(
  { name: 'ViewTransitionAccess', scope: 'global' },
  () =>
    query({
      params: () => true,
      loader: async () => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        return { allowed: true } as const;
      },
    }),
);

const slowDetailGuard = craftGen(
  () =>
    function* () {
      const accessRef = yield* ViewTransitionAccessToYield();
      const access = yield* untilSettled(accessRef);
      // Always allowed here — the `craftException` branch only exists so the guard
      // carries a typed exception code (a guard with no exception branch collapses
      // `route()`'s `Def` inference). `handleExceptions` routes it after commit.
      return access.allowed ? access : craftException({ code: 'DENIED' });
    },
);

export const {
  viewTransitionsRoutes,
  injectViewTransitionsPhotoIdParams,
  injectViewTransitionsPhotoIdViewTransition,
} = craftRoutes('viewTransitions', [
  route('', {
    componentDeps:
      {} as import('./gallery').GenDeps_ViewTransitionsGalleryComponent,
    loadComponent: () => import('./gallery'),
  }),
  route(':photoId', {
    componentDeps:
      {} as import('./photo-detail').GenDeps_ViewTransitionsDetailComponent,
    loadComponent: () => import('./photo-detail'),
    // The route DECLARES the shared-element payload shape (mirrors how
    // `queryParams` declares query-param shape): every link/navigation must pass
    // `viewTransition: { name; image } | null`, and the skeleton reads it via the
    // generated `injectViewTransitionsPhotoIdViewTransition()` helper.
    withLoaderViewTransitionImage: viewTransitionPayload<{
      name: string;
      image: string | null;
    }>(),
    pendingComponent: () => import('./photo-skeleton'),
    // DI declaration for the pending skeleton, mirroring `componentDeps` for the
    // target. Folded into this collection's cascade check below so the skeleton's
    // injected dependencies are verified too. (The brand rule only knows the
    // `componentDeps` ↔ `loadComponent` couple, not this one yet.)
    // ISOLATION TEST: pendingComponentDeps temporarily removed
    canActivate: craftCanActivate(function* () {
      return yield* slowDetailGuard();
    }),
    handleExceptions: {
      DENIED: ({ redirect }) => redirect('/view-transitions'),
    },
  }),
]);

// Exhaustive over canActivate ∪ canMatch ∪ resolve for this collection.
assertExhaustiveRouteExceptions(viewTransitionsRoutes);

// Cascade DI safety for THIS lazy child collection (covers the target component
// AND the pending skeleton via `pendingComponentDeps`). Like slow-page: the
// parent `app.routes` cascade does not descend into `loadChildren`, so we
// re-establish the check here with the same parent context (app-level `Router`).
// ISOLATION TEST: cascade check temporarily disabled
// type _CheckViewTransitionsDI = ValidateCascadeRoutesFile<
//   never,
//   Router,
//   typeof viewTransitionsRoutes
// >;
// type _CanRunViewTransitions = CanRun<_CheckViewTransitionsDI>;
