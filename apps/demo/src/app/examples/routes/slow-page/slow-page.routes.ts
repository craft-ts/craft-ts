import {
  assertExhaustiveRouteExceptions,
  catchTag,
  craftException,
  craftExceptionHandler,
  craftGen,
  craftResolve,
  craftRoutes,
  craftService,
  query,
  craftRoute,
  craftSleep,
  retry,
  craftUntilSettled,
  type CanRun,
  type ComponentDepsOf,
  type RouteCheckedDI,
} from '@craft-ts/core';
import {
  loadCraftComponent,
} from '@craft-ts/component';

// --- Slow guard + slow resolve demo (non-blocking outlet) -------------------
// Two deliberately slow async steps (~1.5s each) used to showcase
// `CraftRouterOutlet`: the URL commits immediately, the pending component
// runs the stay→blank→loader phases, and the target is mounted ONLY once BOTH the guard
// and the resolve have settled. Both are cached global queries, so the FIRST
// visit is slow (pending UI) and a revisit is instant (warm cache) — use the
// 🗑️ Clear Cache button to replay the pending state.
//
// This lives in its own lazy child collection on purpose: it owns the slow
// navigation example and keeps its route-specific DI checks local.
const { SlowAccess } = craftService(
  { name: 'SlowAccess', providedIn: 'global' },
  function* () {
    const slowAccess = yield* query('slowAccess', {
      params: () => true,
      loader: function* () {
        yield* craftSleep(1500);
        return { allowed: true } as const;
      },
    });
    return slowAccess;
  },
);

const { SlowReport } = craftService(
  { name: 'SlowReport', providedIn: 'global' },
  function* () {
    const slowReport = yield* query('slowReport', {
      params: () => true,
      loader: function* () {
        yield* craftSleep(1500);
        return {
          generatedAt: new Date().toLocaleTimeString(),
          totalUsers: 1234,
        };
      },
    });
    return slowReport;
  },
);

// Slow canActivate: suspends ~1.5s until the access check settles, then either
// allows navigation or short-circuits with a typed NOT_AUTHENTICATED exception
// routed through `handleExceptions`.
const slowAccessGuard = craftGen(function* () {
  const accessRef = yield* SlowAccess();
  const access = yield* craftUntilSettled(accessRef);
  return access.allowed
    ? access
    : craftException({ _tag: 'NOT_AUTHENTICATED' });
});

// Slow resolve: suspends ~1.5s until the report loads, then returns it (or a
// typed REPORT_EMPTY exception — recovered locally below through `catchTag`).
// The resolved value is consumed via `injectSlowPageRootResolvedData()`.
const loadSlowReport = craftGen(function* () {
  const reportRef = yield* SlowReport();
  const report = yield* craftUntilSettled(reportRef);
  return report.totalUsers === 0
    ? craftException({ _tag: 'REPORT_EMPTY' })
    : report;
});

export const { slowPageRoutes } = craftRoutes(
  'slowPage',
  [
    craftRoute(
      '',
      {
        ...loadCraftComponent(({ withRetry }) =>
          withRetry(import('./slow-page')).then(
            ({ default: component }) => component,
          ),
        ),
        // Slow (~1.5s) — the outlet shows the pending component until it settles.
        // `retry` replays the whole guard program on failure (E unchanged, so
        // NOT_AUTHENTICATED still routes through `handleExceptions`).
        canActivate: function* () {
          return yield* slowAccessGuard().pipe(
            retry({ times: 2, backoff: 'linear', delayMs: 250 }),
          );
        },
        // Slow (~1.5s) — runs after the guard; the target mounts only once settled.
        // `catchTag` recovers REPORT_EMPTY locally: the code leaves the route's
        // exception union, so no route handler is required for it.
        resolve: craftResolve(function* () {
          return yield* loadSlowReport().pipe(
            catchTag('REPORT_EMPTY', function* () {
              return { generatedAt: 'n/a', totalUsers: 0 };
            }),
          );
        }),
      },
      {
        // Exhaustive over canActivate ∪ canMatch ∪ resolve, enforced at the call site.
        NOT_AUTHENTICATED: craftExceptionHandler(function* ({ redirectUrl }) {
          return redirectUrl('/login-form');
        }),
      },
    ),
  ],
);

// Required-handler safety net for routes authored with the 2-arg `craftRoute()` form.
assertExhaustiveRouteExceptions(slowPageRoutes);

// O(1) component DI check for this lazy collection. Keeping the check local
// avoids expanding the already-deep guard/resolve dependency graph a second
// time while still validating the component contract inferred from the SFC.
type _CheckSlowPageDI = RouteCheckedDI<
  ComponentDepsOf<(typeof import('./slow-page'))['default']>,
  never,
  never,
  'component: slow-page'
>;
type _CanRunSlowPage = CanRun<_CheckSlowPageDI>;
