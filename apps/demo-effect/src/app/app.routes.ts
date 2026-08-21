import { loadCraftComponent } from '@craft-ts/component';
import {
  assertExhaustiveRouteExceptions,
  craftExceptionHandler,
  craftRoutes,
  type CanRun,
  type ComponentDepsOf,
  type CraftRouteExceptionType,
  type RouteCheckedDI,
} from '@craft-ts/core';
import {
  provideLayer,
  type EffectRequirementsCheckedDI,
  type ProvidedEffectServicesOf,
} from '@craft-ts/effect';
import type { Effect } from 'effect';
import type { AppProvidedEffectServices } from './app.config';
import { SupportTeamLive } from './shared/access-domain';
import type { checkUserAccess, loadTeamOverview } from './shared/access-domain';

// Named so `ProvidedEffectServicesOf` can read back what this route actually
// installs — inlining the array in `loadCraftComponent(...)` below would
// leave nothing for the DI check further down to type-check against.
const teamRouteProviders = [provideLayer(SupportTeamLive)] as const;

export const { demoEffectRoutes } = craftRoutes('demo-effect', [
  {
    path: '',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/effect/effect-profile-lookup')).then(
        ({ default: component }) => component,
      ),
    ),
    handleExceptions: {
      UserNotFound: craftExceptionHandler(function* ({ globalError }) {
        return globalError();
      }),
      Unauthorized: craftExceptionHandler(function* ({ globalError }) {
        return globalError();
      }),
    },
  },
  {
    path: 'access',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(
        import('./examples/effect/effect-access-check-shared-service'),
      ).then(({ default: component }) => component),
    ),
    handleExceptions: {
      UserNotFound: craftExceptionHandler(function* ({ globalError }) {
        return globalError();
      }),
    },
  },
  {
    path: 'team',
    ...loadCraftComponent(
      ({ withRetry }) =>
        withRetry(
          import('./examples/effect/effect-team-overview-layer-scope'),
        ).then(({ default: component }) => component),
      teamRouteProviders,
    ),
  },
]);

assertExhaustiveRouteExceptions(demoEffectRoutes);

declare module '@craft-ts/core' {
  interface CraftGlobalExceptionRegistry {
    access: {
      UserNotFound: CraftRouteExceptionType<
        typeof demoEffectRoutes,
        'access',
        'UserNotFound'
      >;
    };
  }
}

// The cascade check reaches TS2589 in this Effect-heavy collection. Keep one
// O(1) RouteCheckedDI proof per routed component instead.
type _CheckEffectYieldDI = RouteCheckedDI<
  ComponentDepsOf<
    (typeof import('./examples/effect/effect-profile-lookup'))['default']
  >,
  'CraftRouter',
  never,
  'component: effect-yield'
>;
type _CanRunEffectYield = CanRun<_CheckEffectYieldDI>;

type _CheckEffectSharedServiceDI = RouteCheckedDI<
  ComponentDepsOf<
    (typeof import('./examples/effect/effect-access-check-shared-service'))['default']
  >,
  'CraftRouter',
  never,
  'component: effect-shared-service'
>;
type _CanRunEffectSharedService = CanRun<_CheckEffectSharedServiceDI>;

type _CheckEffectLayerScopeDI = RouteCheckedDI<
  ComponentDepsOf<
    (typeof import('./examples/effect/effect-team-overview-layer-scope'))['default']
  >,
  'CraftRouter',
  never,
  'component: effect-layer-scope'
>;
type _CanRunEffectLayerScope = CanRun<_CheckEffectLayerScopeDI>;

// EffectRequirementsCheckedDI proofs — the DI check above only covers
// `injectX`-style craft services. `checkUserAccess`/`loadTeamOverview` are
// Effects resolved through `provideLayer(...)` on the injector, invisible to
// the checks above; removing the `provideLayer(...)` that satisfies one of
// them must still fail the build.
type _CheckAccessQueryRequirements = EffectRequirementsCheckedDI<
  Effect.Services<ReturnType<typeof checkUserAccess>>,
  AppProvidedEffectServices
>;
type _CanRunAccessQueryRequirements = CanRun<_CheckAccessQueryRequirements>;

// `/team` also relies on this route's own `provideLayer(SupportTeamLive)` —
// read from `teamRouteProviders` so removing it from the route is what fails
// the build, not just removing the `SupportTeamLive` import.
type _CheckTeamOverviewRequirements = EffectRequirementsCheckedDI<
  Effect.Services<typeof loadTeamOverview>,
  | AppProvidedEffectServices
  | ProvidedEffectServicesOf<typeof teamRouteProviders>
>;
type _CanRunTeamOverviewRequirements = CanRun<_CheckTeamOverviewRequirements>;
