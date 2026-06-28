import {
  assertExhaustiveRouteExceptions,
  craftCanActivate,
  craftException,
  craftExceptionHandler,
  craftGen,
  craftRoutes,
  craftService,
  query,
  craftRoute,
  untilSettled,
  viewTransitionPayload,
  type CanRun,
  type ParentRoutes,
  type RouteCheckedDI,
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

const slowDetailGuard = craftGen(function* () {
  const accessRef = yield* ViewTransitionAccessToYield();
  const access = yield* untilSettled(accessRef);
  // Always allowed here — the `craftException` branch only exists so the guard
  // carries a typed exception code (a guard with no exception branch collapses
  // `craftRoute()`'s `Def` inference). `handleExceptions` routes it after commit.
  return access.allowed ? access : craftException({ code: 'DENIED' });
});

export const {
  viewTransitionsRoutes,
  injectViewTransitionsPhotoIdParams,
  injectViewTransitionsPhotoIdViewTransition,
} = craftRoutes('viewTransitions', [
  craftRoute('', {
    componentDeps:
      {} as import('./gallery').GenDeps_ViewTransitionsGalleryComponent,
    loadComponent: ({ withRetry }) => withRetry(import('./gallery')),
  }),
  craftRoute(
    ':photoId',
    {
      componentDeps:
        {} as import('./photo-detail').GenDeps_ViewTransitionsDetailComponent,
      loadComponent: ({ withRetry }) => withRetry(import('./photo-detail')),
      // The route DECLARES the shared-element payload shape (mirrors how
      // `queryParams` declares query-param shape): every link/navigation must pass
      // `viewTransition: { name; image } | null`, and the skeleton reads it via the
      // generated `injectViewTransitionsPhotoIdViewTransition()` helper.
      withLoaderViewTransitionImage: viewTransitionPayload<{
        name: string;
        image: string | null;
      }>(),
      pendingComponent: () => import('./photo-skeleton'),
      canActivate: craftCanActivate(function* () {
        return yield* slowDetailGuard();
      }),
    },
    {
      // Exhaustive over canActivate ∪ canMatch ∪ resolve, enforced at the call site.
      DENIED: craftExceptionHandler(function* ({ redirectUrl }) {
        return redirectUrl('/view-transitions');
      }),
    },
  ),
  // Pin this lazy child collection to its mount path: the `loadChildren` slot of
  // the `view-transitions` route in `app.routes` only accepts a collection
  // branded for that exact path — a wrong placement is a compile error.
]).withParent<ParentRoutes<'view-transitions'>>();

// Required-handler safety net for routes authored with the 2-arg `craftRoute()` form.
assertExhaustiveRouteExceptions(viewTransitionsRoutes);

// Cascade DI safety for THIS lazy child collection. Like slow-page: the parent
// `app.routes` cascade does not descend into `loadChildren`, so we re-establish
// the check here with the same parent context (app-level `Router`).
//
// Two checks. The TARGET component (`photo-detail`) via the aggregated cascade…
type _CheckViewTransitionsDI = ValidateCascadeRoutesFile<
  never,
  Router,
  typeof viewTransitionsRoutes
>;
type _CanRunViewTransitions = CanRun<_CheckViewTransitionsDI>;

// …and the PENDING skeleton (`photo-skeleton`) via the per-component, O(1)
// `RouteCheckedDI` (setup.md "Escape hatch"). The cascade does not see the
// pending component, so we verify it directly here. The route auto-provides the
// `:photoId` param and the typed view-transition payload (listed as available);
// `Router` is the app-level provided value. This block is generated/refreshed
// from `pendingComponent` by the `require-pending-component-di-check` ESLint rule.
type _CheckViewTransitionsPendingDI = RouteCheckedDI<
  import('./photo-skeleton').GenDeps_ViewTransitionsSkeletonComponent,
  'ViewTransitionsPhotoIdParams' | 'ViewTransitionsPhotoIdViewTransition',
  Router,
  'pending component: view-transitions/:photoId'
>;
type _CanRunViewTransitionsPending = CanRun<_CheckViewTransitionsPendingDI>;
