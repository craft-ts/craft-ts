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
  type ProvidedEffectServicesOfRoute,
} from '@craft-ts/effect';
import type { Effect } from 'effect';
import type { AppProvidedEffectServices } from './app.config';
import { SupportTeamLive } from './shared/access-domain';
import type { checkUserAccess, loadTeamOverview } from './shared/access-domain';
import { InMemoryDatabaseLive } from './examples/effect/effect-database';
import type { getData } from './examples/effect/effect-function';
import { CartPricingLive } from './examples/effect/effect-pricing-domain';
import type { cartTotalLabel } from './examples/effect/effect-pricing-domain';

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
      [provideLayer(SupportTeamLive)] as const,
    ),
  },
  {
    path: 'sync-members',
    ...loadCraftComponent(
      ({ withRetry }) =>
        withRetry(import('./examples/effect/effect-sync-members')).then(
          ({ default: component }) => component,
        ),
      [provideLayer(CartPricingLive)] as const,
    ),
  },
  {
    path: 'effect-function',
    ...loadCraftComponent(
      ({ withRetry }) =>
        withRetry(import('./examples/effect/effect-function')).then(
          ({ default: component }) => component,
        ),
      [provideLayer(InMemoryDatabaseLive)] as const,
    ),
    handleExceptions: {
      DatabaseConnectionError: craftExceptionHandler(function* ({
        globalError,
      }) {
        return globalError();
      }),
    },
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
    'effect-function': {
      DatabaseConnectionError: CraftRouteExceptionType<
        typeof demoEffectRoutes,
        'effect-function',
        'DatabaseConnectionError'
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

type _CheckEffectSyncMembersDI = RouteCheckedDI<
  ComponentDepsOf<
    (typeof import('./examples/effect/effect-sync-members'))['default']
  >,
  'CraftRouter',
  never,
  'component: effect-sync-members'
>;
type _CanRunEffectSyncMembers = CanRun<_CheckEffectSyncMembersDI>;

type _CheckEffectFunctionDI = RouteCheckedDI<
  ComponentDepsOf<
    (typeof import('./examples/effect/effect-function'))['default']
  >,
  'CraftRouter',
  never,
  'component: effect-function'
>;
type _CanRunEffectFunction = CanRun<_CheckEffectFunctionDI>;

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

// `/team` also relies on this route's own `provideLayer(SupportTeamLive)`.
type _CheckTeamOverviewRequirements = EffectRequirementsCheckedDI<
  Effect.Services<typeof loadTeamOverview>,
  | AppProvidedEffectServices
  | ProvidedEffectServicesOfRoute<typeof demoEffectRoutes._routes, 'team'>
>;
type _CanRunTeamOverviewRequirements = CanRun<_CheckTeamOverviewRequirements>;

// `/effect-function` resolves Database from its own route-scoped in-memory
// Layer. The operation itself remains a standalone Effect program, so its
// requirement is checked against the provider installed at that route.
type _CheckEffectFunctionRequirements = EffectRequirementsCheckedDI<
  Effect.Services<typeof getData>,
  | AppProvidedEffectServices
  | ProvidedEffectServicesOfRoute<
      typeof demoEffectRoutes._routes,
      'effect-function'
    >
>;
type _CanRunEffectFunctionRequirements = CanRun<_CheckEffectFunctionRequirements>;

// `/sync-members` runs `cartTotalLabel` from a craftComputed through
// `syncEffect(...)`. Its `SyncOp` requirement is a phantom — nothing provides
// it — so only `CartPricing` is checked here, against this route's own Layer.
type _CheckCartPricingRequirements = EffectRequirementsCheckedDI<
  Effect.Services<ReturnType<typeof cartTotalLabel>>,
  | AppProvidedEffectServices
  | ProvidedEffectServicesOfRoute<
      typeof demoEffectRoutes._routes,
      'sync-members'
    >
>;
type _CanRunCartPricingRequirements = CanRun<_CheckCartPricingRequirements>;
