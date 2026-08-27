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
  craftRoute(
    '',
    {
      ...loadCraftComponent(({ withRetry }) =>
        withRetry(import('./public-products-demo')).then(
          ({ PublicProductsDemo }) => PublicProductsDemo,
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
    'authenticated-list',
    {
      ...loadCraftComponent(({ withRetry }) =>
        withRetry(import('./server-function-demo')).then(
          ({ ServerFunctionDemo }) => ServerFunctionDemo,
        ),
      ),
    },
    {
      SessionRequired: craftExceptionHandler(function* ({ redirectUrl }) {
        return redirectUrl('/session-required');
      }),
      SessionRevoked: craftExceptionHandler(function* ({ redirectUrl }) {
        return redirectUrl('/session-revoked');
      }),
      AdminRequired: craftExceptionHandler(function* ({ redirectUrl }) {
        return redirectUrl('/access-denied');
      }),
      AuthenticatedUserMismatch: craftExceptionHandler(function* ({
        redirectUrl,
      }) {
        return redirectUrl('/access-denied');
      }),
      AuthenticatedUsersNotFound: craftExceptionHandler(function* ({
        redirectUrl,
      }) {
        return redirectUrl('/users-not-found');
      }),
      HttpError: craftExceptionHandler(function* ({ globalError }) {
        return globalError();
      }),
    },
  ),
  craftRoute('session-required', {
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./server-function-status-pages')).then(
        ({ SessionRequiredPage }) => SessionRequiredPage,
      ),
    ),
  }),
  craftRoute('session-revoked', {
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./server-function-status-pages')).then(
        ({ SessionRevokedPage }) => SessionRevokedPage,
      ),
    ),
  }),
  craftRoute('access-denied', {
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./server-function-status-pages')).then(
        ({ AccessDeniedPage }) => AccessDeniedPage,
      ),
    ),
  }),
  craftRoute('users-not-found', {
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./server-function-status-pages')).then(
        ({ UsersNotFoundPage }) => UsersNotFoundPage,
      ),
    ),
  }),
  craftRoute(
    'simple-list',
    {
      ...loadCraftComponent(({ withRetry }) =>
        withRetry(import('./simple-list-demo')).then(
          ({ SimpleListDemo }) => SimpleListDemo,
        ),
      ),
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
      DemoMiddlewareFailure: craftExceptionHandler(function* ({ globalError }) {
        return globalError();
      }),
      DemoHandlerFailure: craftExceptionHandler(function* ({ globalError }) {
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

type _CheckSessionRequiredPageDI = RouteCheckedDI<
  ComponentDepsOf<
    (typeof import('./server-function-status-pages'))['SessionRequiredPage']
  >,
  'CraftRouter',
  never,
  'component: session-required'
>;
type _CanRunSessionRequiredPage = CanRun<_CheckSessionRequiredPageDI>;

type _CheckSessionRevokedPageDI = RouteCheckedDI<
  ComponentDepsOf<
    (typeof import('./server-function-status-pages'))['SessionRevokedPage']
  >,
  'CraftRouter',
  never,
  'component: session-revoked'
>;
type _CanRunSessionRevokedPage = CanRun<_CheckSessionRevokedPageDI>;

type _CheckAccessDeniedPageDI = RouteCheckedDI<
  ComponentDepsOf<
    (typeof import('./server-function-status-pages'))['AccessDeniedPage']
  >,
  'CraftRouter',
  never,
  'component: access-denied'
>;
type _CanRunAccessDeniedPage = CanRun<_CheckAccessDeniedPageDI>;

type _CheckUsersNotFoundPageDI = RouteCheckedDI<
  ComponentDepsOf<
    (typeof import('./server-function-status-pages'))['UsersNotFoundPage']
  >,
  'CraftRouter',
  never,
  'component: users-not-found'
>;
type _CanRunUsersNotFoundPage = CanRun<_CheckUsersNotFoundPageDI>;

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
