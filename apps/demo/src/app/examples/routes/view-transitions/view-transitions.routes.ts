import {
  assertExhaustiveRouteExceptions,
  craftException,
  craftExceptionHandler,
  craftGen,
  craftRoutes,
  craftService,
  query,
  craftRoute,
  craftUntilSettled,
  viewTransitionPayload,
  type CanRun,
  type ComponentDepsOf,
  type ParentRoutes,
  type RouteCheckedDI,
} from '@craft-ng/core';
import type { Router } from '@angular/router';
import {
  CraftPendingComponentHost,
  loadCraftComponent,
  provideCraftPendingComponent,
} from '@craft-ng/component';
import PhotoSkeleton from './photo-skeleton';

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
  const access = yield* craftUntilSettled(accessRef);
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
  {
    path: '',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./gallery')).then(
        ({ default: component }) => component,
      ),
    ),
  },
  craftRoute(
    ':photoId',
    {
      ...loadCraftComponent(
        ({ withRetry }) =>
          withRetry(import('./photo-detail')).then(
            ({ default: component }) => component,
          ),
        [provideCraftPendingComponent(PhotoSkeleton)],
      ),
      // The route DECLARES the shared-element payload shape (mirrors how
      // `queryParams` declares query-params shape): every link/navigation must pass
      // `viewTransition: { name; image } | null`, and the skeleton reads it via the
      // generated `injectViewTransitionsPhotoIdViewTransition()` helper.
      withLoaderViewTransitionImage: viewTransitionPayload<{
        name: string;
        image: string | null;
      }>(),
      pendingComponent: CraftPendingComponentHost,
      canActivate: function* () {
        return yield* slowDetailGuard();
      },
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

// O(1) component DI checks for this lazy collection. They use the contracts
// inferred directly from the SFCs without expanding the slow guard graph.
type _CheckViewTransitionsGalleryDI = RouteCheckedDI<
  ComponentDepsOf<(typeof import('./gallery'))['default']>,
  never,
  Router,
  'component: view-transitions gallery'
>;
type _CanRunViewTransitionsGallery = CanRun<_CheckViewTransitionsGalleryDI>;

type _CheckViewTransitionsDetailDI = RouteCheckedDI<
  ComponentDepsOf<(typeof import('./photo-detail'))['default']>,
  never,
  Router,
  'component: view-transitions/:photoId',
  'photoId'
>;
type _CanRunViewTransitionsDetail = CanRun<_CheckViewTransitionsDetailDI>;

// The pending skeleton receives both values from the route host.
type _CheckViewTransitionsPendingDI = RouteCheckedDI<
  ComponentDepsOf<typeof PhotoSkeleton>,
  'ViewTransitionsPhotoIdParams' | 'ViewTransitionsPhotoIdViewTransition',
  Router,
  'pending component: view-transitions/:photoId',
  'photoId' | 'viewTransition'
>;
type _CanRunViewTransitionsPending = CanRun<_CheckViewTransitionsPendingDI>;
