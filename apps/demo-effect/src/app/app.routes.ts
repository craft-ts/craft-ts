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
import { provideLayer } from '@craft-ts/effect';
import { SupportTeamLive } from './shared/access-domain';

export const { demoEffectRoutes } = craftRoutes('demo-effect', [
  {
    path: '',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/effect/effect-yield')).then(
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
      withRetry(import('./examples/effect/effect-shared-service')).then(
        ({ default: component }) => component,
      ),
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
        withRetry(import('./examples/effect/effect-layer-scope')).then(
          ({ default: component }) => component,
        ),
      [provideLayer(SupportTeamLive)],
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
  ComponentDepsOf<(typeof import('./examples/effect/effect-yield'))['default']>,
  'CraftRouter',
  never,
  'component: effect-yield'
>;
type _CanRunEffectYield = CanRun<_CheckEffectYieldDI>;

type _CheckEffectSharedServiceDI = RouteCheckedDI<
  ComponentDepsOf<
    (typeof import('./examples/effect/effect-shared-service'))['default']
  >,
  'CraftRouter',
  never,
  'component: effect-shared-service'
>;
type _CanRunEffectSharedService = CanRun<_CheckEffectSharedServiceDI>;

type _CheckEffectLayerScopeDI = RouteCheckedDI<
  ComponentDepsOf<
    (typeof import('./examples/effect/effect-layer-scope'))['default']
  >,
  'CraftRouter',
  never,
  'component: effect-layer-scope'
>;
type _CanRunEffectLayerScope = CanRun<_CheckEffectLayerScopeDI>;
