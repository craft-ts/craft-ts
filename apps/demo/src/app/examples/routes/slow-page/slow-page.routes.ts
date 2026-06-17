import {
  assertExhaustiveRouteExceptions,
  craftCanActivate,
  craftException,
  craftGen,
  craftResolve,
  craftRoutes,
  craftService,
  query,
  route,
  untilSettled,
  type CanRun,
  type ValidateCascadeRoutesFile,
} from '@craft-ng/core';
import type { Router } from '@angular/router';

// --- Slow guard + slow resolve demo (non-blocking outlet) -------------------
// Two deliberately slow async steps (~1.5s each) used to showcase
// `CraftRouterOutlet`: the URL commits immediately, the pending component
// runs the stay→blank→loader phases, and the target is mounted ONLY once BOTH the guard
// and the resolve have settled. Both are cached global queries, so the FIRST
// visit is slow (pending UI) and a revisit is instant (warm cache) — use the
// 🗑️ Clear Cache button to replay the pending state.
//
// This lives in its own lazy child collection on purpose: the main `app.routes`
// cascade DI check (`ValidateCascadeRoutesFile`) is already at TypeScript's
// instantiation-depth ceiling, and `loadChildren` collections are not folded
// into the parent's budget.
const { SlowAccessToYield } = craftService(
  { name: 'SlowAccess', scope: 'global' },
  () =>
    query({
      params: () => true,
      loader: async () => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return { allowed: true } as const;
      },
    }),
);

const { SlowReportToYield } = craftService(
  { name: 'SlowReport', scope: 'global' },
  () =>
    query({
      params: () => true,
      loader: async () => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return {
          generatedAt: new Date().toLocaleTimeString(),
          totalUsers: 1234,
        };
      },
    }),
);

// Slow canActivate: suspends ~1.5s until the access check settles, then either
// allows navigation or short-circuits with a typed NOT_AUTHENTICATED exception
// routed through `handleExceptions`.
const slowAccessGuard = craftGen(function* () {
  const accessRef = yield* SlowAccessToYield();
  const access = yield* untilSettled(accessRef);
  return access.allowed
    ? access
    : craftException({ code: 'NOT_AUTHENTICATED' });
});

// Slow resolve: suspends ~1.5s until the report loads, then returns it. The
// resolved value is consumed via `injectSlowPageRootResolvedData()`.
const loadSlowReport = craftGen(function* () {
  const reportRef = yield* SlowReportToYield();
  return yield* untilSettled(reportRef);
});

export const { slowPageRoutes, injectSlowPageRootResolvedData } = craftRoutes(
  'slowPage',
  [
    route('', {
      componentDeps: {} as import('./slow-page').GenDeps_SlowPageComponent,
      loadComponent: () => import('./slow-page'),
      // Slow (~1.5s) — the outlet shows the pending component until it settles.
      canActivate: craftCanActivate(function* () {
        return yield* slowAccessGuard();
      }),
      // Slow (~1.5s) — runs after the guard; the target mounts only once settled.
      resolve: craftResolve(function* () {
        return yield* loadSlowReport();
      }),
    }, {
      // Exhaustive over canActivate ∪ canMatch ∪ resolve, enforced at the call site.
      NOT_AUTHENTICATED: ({ redirect }) => redirect('/login-form'),
    }),
  ],
);

// Required-handler safety net for routes authored with the 2-arg `route()` form.
assertExhaustiveRouteExceptions(slowPageRoutes);

// Cascade DI safety for THIS lazy child collection.
//
// `ValidateCascadeRoutesFile` in `app.routes.ts` validates only `demoRoutes`'
// own `META_DATA` — it does NOT descend into `loadChildren`. So a lazy child
// collection would otherwise ship with ZERO compile-time DI checking. We restore
// it here, scoped to the child collection, with the same parent context the
// parent route runs under (app-level `Router` by value; no extra named
// providers). Any service a child route component injects but that is not
// provided (app-level, route-level, or by the outlet for resolved data) becomes
// a TypeScript error here — exactly like the main file's check.
type _CheckSlowPageDI = ValidateCascadeRoutesFile<
  never,
  Router,
  typeof slowPageRoutes
>;
type _CanRunSlowPage = CanRun<_CheckSlowPageDI>;
