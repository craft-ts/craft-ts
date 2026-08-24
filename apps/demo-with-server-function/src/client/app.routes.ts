import { loadCraftComponent } from '@craft-ts/component';
import {
  assertExhaustiveRouteExceptions,
  craftExceptionHandler,
  craftRoute,
  craftRoutes,
  type CanRun,
  type ComponentDepsOf,
  type RouteCheckedDI,
} from '@craft-ts/core';

export const { appRoutes } = craftRoutes('app', [
  craftRoute('', {
    ...loadCraftComponent(async () => {
      const { PublicProductsDemo } = await import('./public-products-demo');
      return PublicProductsDemo;
    }),
  }),
  craftRoute(
    'authenticated-list',
    {
      ...loadCraftComponent(async () => {
        const { ServerFunctionDemo } = await import('./server-function-demo');
        return ServerFunctionDemo;
      }),
    },
    {
      AdminRequired: craftExceptionHandler(function* ({ globalError }) {
        return globalError();
      }),
      AuthenticatedUserMismatch: craftExceptionHandler(function* ({
        globalError,
      }) {
        return globalError();
      }),
      AuthenticatedUsersNotFound: craftExceptionHandler(function* ({
        globalError,
      }) {
        return globalError();
      }),
      HttpError: craftExceptionHandler(function* ({ globalError }) {
        return globalError();
      }),
    },
  ),
  craftRoute(
    'simple-list',
    {
      ...loadCraftComponent(async () => {
        const { SimpleListDemo } = await import('./simple-list-demo');
        return SimpleListDemo;
      }),
    },
    {
      HttpError: craftExceptionHandler(function* ({ globalError }) {
        return globalError();
      }),
      UsersNotFound: craftExceptionHandler(function* ({ globalError }) {
        return globalError();
      }),
    },
  ),
  craftRoute(
    'portable',
    {
      ...loadCraftComponent(({ withRetry }) =>
        withRetry(import('./portable-server-function-demo')).then(
          ({ PortableServerFunctionDemo }) => PortableServerFunctionDemo,
        ),
      ),
    },
    {
      HttpError: craftExceptionHandler(function* ({ globalError }) {
        return globalError();
      }),
    },
  ),
  craftRoute(
    'effect-middleware',
    {
      ...loadCraftComponent(({ withRetry }) =>
        withRetry(import('./effect-server-middleware-demo')).then(
          ({ EffectServerMiddlewareDemo }) => EffectServerMiddlewareDemo,
        ),
      ),
    },
    {
      HttpError: craftExceptionHandler(function* ({ globalError }) {
        return globalError();
      }),
    },
  ),
]);

assertExhaustiveRouteExceptions(appRoutes);

type _CheckServerFunctionDemoDI = RouteCheckedDI<
  ComponentDepsOf<
    (typeof import('./server-function-demo'))['ServerFunctionDemo']
  >,
  'CraftRouter',
  never,
  'component: server-function-demo'
>;
type _CanRunServerFunctionDemo = CanRun<_CheckServerFunctionDemoDI>;

type _CheckPublicProductsDemoDI = RouteCheckedDI<
  ComponentDepsOf<
    (typeof import('./public-products-demo'))['PublicProductsDemo']
  >,
  'CraftRouter',
  never,
  'component: public-products-demo'
>;
type _CanRunPublicProductsDemo = CanRun<_CheckPublicProductsDemoDI>;

type _CheckSimpleListDemoDI = RouteCheckedDI<
  ComponentDepsOf<(typeof import('./simple-list-demo'))['SimpleListDemo']>,
  'CraftRouter',
  never,
  'component: simple-list-demo'
>;
type _CanRunSimpleListDemo = CanRun<_CheckSimpleListDemoDI>;

type _CheckPortableServerFunctionDemoDI = RouteCheckedDI<
  ComponentDepsOf<
    (typeof import('./portable-server-function-demo'))['PortableServerFunctionDemo']
  >,
  'CraftRouter',
  never,
  'component: portable-server-function-demo'
>;
type _CanRunPortableServerFunctionDemo =
  CanRun<_CheckPortableServerFunctionDemoDI>;

type _CheckEffectServerMiddlewareDemoDI = RouteCheckedDI<
  ComponentDepsOf<
    (typeof import('./effect-server-middleware-demo'))['EffectServerMiddlewareDemo']
  >,
  'CraftRouter',
  never,
  'component: effect-server-middleware-demo'
>;
type _CanRunEffectServerMiddlewareDemo =
  CanRun<_CheckEffectServerMiddlewareDemoDI>;

declare module '@craft-ts/core' {
  interface CraftRouterRoutesRegistry {
    DemoWithServerFunction: typeof appRoutes.META_PATHS;
  }
}
