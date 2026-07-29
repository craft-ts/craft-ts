import type { ActivatedRoute, Router } from '@angular/router';
import { loadCraftComponent } from '@craft-ng/component';
import {
  assertExhaustiveRouteExceptions,
  craftExceptionHandler,
  craftRoute,
  craftRoutes,
  queryParams,
  type CanRun,
  type ComponentDepsOf,
  type CraftRouteExceptionType,
  type RouteCheckedDI,
} from '@craft-ng/core';
import { authGuard } from './guard/auth.guard';

export const { demoRoutes } = craftRoutes('demo', [
  {
    path: 'query/:userId',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/primitives/query/query')).then(
        ({ default: component }) => component,
      ),
    ),
  },
  {
    path: 'slow-page',
    loadChildren: ({ withRetry }) =>
      withRetry(import('./examples/routes/slow-page/slow-page.routes')).then(
        (module) => module.slowPageRoutes,
      ),
  },
  {
    path: 'view-transitions',
    loadChildren: ({ withRetry }) =>
      withRetry(
        import('./examples/routes/view-transitions/view-transitions.routes'),
      ).then((module) => module.viewTransitionsRoutes),
  },
  {
    path: '',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/component/component-demo')).then(
        ({ componentDemo }) => componentDemo,
      ),
    ),
  },
  {
    path: 'component-composition',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/component/component-composition-demo')).then(
        ({ componentCompositionDemo }) => componentCompositionDemo,
      ),
    ),
  },
  {
    path: 'mutation/:userId',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/primitives/mutation/mutation')).then(
        ({ default: component }) => component,
      ),
    ),
  },
  {
    path: 'list-with-pagination',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(
        import(
          './examples/primitives/list-with-pagination/list-with-pagination'
        ),
      ).then(({ default: component }) => component),
    ),
  },
  {
    path: 'granular-mutation',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(
        import('./examples/primitives/granular-mutation/granular-mutation'),
      ).then(({ default: component }) => component),
    ),
  },
  {
    path: 'full-demo',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/primitives/full-demo/full-demo')).then(
        ({ default: component }) => component,
      ),
    ),
  },
  {
    path: 'pixel-art',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/primitives/pixel-art/pixel-art')).then(
        ({ default: component }) => component,
      ),
    ),
  },
  {
    path: 'pixel-art-matrix',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(
        import('./examples/primitives/pixel-art-matrix/pixel-art-matrix'),
      ).then(({ default: component }) => component),
    ),
  },
  {
    path: 'exceptions',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/primitives/exceptions/exceptions')).then(
        ({ default: component }) => component,
      ),
    ),
  },
  {
    path: 'exception-query-params',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(
        import('./examples/primitives/exceptions/exception-query-params'),
      ).then(({ default: component }) => component),
    ),
  },
  {
    path: 'craft/query/:userId',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/craft/query/query')).then(
        ({ default: component }) => component,
      ),
    ),
  },
  {
    path: 'craft/mutation/:userId',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/craft/mutation/mutation')).then(
        ({ default: component }) => component,
      ),
    ),
  },
  {
    path: 'craft/list-with-pagination',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(
        import('./examples/craft/list-with-pagination/list-with-pagination'),
      ).then(({ default: component }) => component),
    ),
  },
  {
    path: 'craft/granular-mutation',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(
        import('./examples/craft/granular-mutation/granular-mutation'),
      ).then(({ default: component }) => component),
    ),
  },
  {
    path: 'craft/full-demo',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/craft/full-demo/full-demo')).then(
        ({ default: component }) => component,
      ),
    ),
  },
  {
    path: 'craft/lazy-layout/:teamId',
    data: { someParentRouteData: 'foo' },
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/craft/lazy-layout/lazy-layout')).then(
        ({ default: component }) => component,
      ),
    ),
    loadChildren: ({ withRetry }) =>
      withRetry(import('./examples/craft/lazy-layout/lazy-layout.routes')).then(
        (module) => module.lazyLayoutRoutes,
      ),
  },
  {
    path: 'login-form',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/primitives/forms/login-form')).then(
        ({ default: component }) => component,
      ),
    ),
  },
  {
    path: 'craft-service/counter',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/craft-service/craft-service-counter')).then(
        ({ default: component }) => component,
      ),
    ),
  },
  {
    path: 'craft-service/user-detail',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(
        import('./examples/craft-service/craft-service-user-detail'),
      ).then(({ default: component }) => component),
    ),
  },
  {
    path: 'demo-send-context',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(
        import('./examples/ia/demo-send-context/demo-send-context'),
      ).then(({ default: component }) => component),
    ),
  },
  {
    path: 'playground',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/playground/playground')).then(
        ({ default: component }) => component,
      ),
    ),
  },
  {
    path: 'query-params',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(
        import(
          './examples/routes/list-with-pagination/qp-list-with-pagination'
        ),
      ).then(({ default: component }) => component),
    ),
    queryParams: function* () {
      const { pagination } = yield* queryParams(
        'pagination',
        {
          state: {
            page: {
              fallbackValue: 1,
              codec: {
                decode: (value: string) => Number(value),
                encode: (value: number) => String(value),
              },
            },
            pageSize: {
              fallbackValue: 4,
              codec: {
                decode: (value: string) => Number(value),
                encode: (value: number) => String(value),
              },
            },
          },
        },
        ({ patch, state }) => ({
          nextPage: () => patch({ page: state().page + 1 }),
          previousPage: () => patch({ page: state().page - 1 }),
          updatePageSize: (pageSize: number) => patch({ pageSize, page: 1 }),
        }),
      );
      return pagination;
    },
  },
  craftRoute(
    'guard-demo',
    {
      ...loadCraftComponent(({ withRetry }) =>
        withRetry(import('./examples/routes/guard-demo/GuardDemo')).then(
          ({ GuardDemo }) => GuardDemo,
        ),
      ),
      canActivate: function* () {
        return yield* authGuard();
      },
    },
    {
      NOT_AUTHENTICATED: craftExceptionHandler(function* ({ redirectUrl }) {
        return redirectUrl('/login-form');
      }),
      USER_DISABLED: craftExceptionHandler(function* ({ globalError }) {
        return globalError();
      }),
    },
  ),
]);

declare module '@craft-ng/core' {
  interface CraftRouterRoutesRegistry {
    Demo: typeof demoRoutes.META_PATHS;
  }
}

assertExhaustiveRouteExceptions(demoRoutes);

declare module '@craft-ng/core' {
  interface CraftGlobalExceptionRegistry {
    'guard-demo': {
      USER_DISABLED: CraftRouteExceptionType<
        typeof demoRoutes,
        'guard-demo',
        'USER_DISABLED'
      >;
    };
  }
}

type DemoRouteCheckedDI<
  Component,
  RouteInputs extends string = never,
  Context extends string = 'demo route component',
> = RouteCheckedDI<
  ComponentDepsOf<Component>,
  'CraftRouter',
  Router | ActivatedRoute,
  Context,
  RouteInputs
>;

type _CanRunQuery = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/primitives/query/query'))['default'],
    'userId',
    'path: "query/:userId"'
  >
>;
type _CanRunComponentDemo = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/component/component-demo'))['componentDemo'],
    never,
    'path: ""'
  >
>;
type _CanRunMutation = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/primitives/mutation/mutation'))['default'],
    'userId',
    'path: "mutation/:userId"'
  >
>;
type _CanRunListWithPagination = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/primitives/list-with-pagination/list-with-pagination'))['default'],
    never,
    'path: "list-with-pagination"'
  >
>;
type _CanRunGranularMutation = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/primitives/granular-mutation/granular-mutation'))['default'],
    never,
    'path: "granular-mutation"'
  >
>;
type _CanRunFullDemo = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/primitives/full-demo/full-demo'))['default'],
    never,
    'path: "full-demo"'
  >
>;
type _CanRunPixelArt = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/primitives/pixel-art/pixel-art'))['default'],
    never,
    'path: "pixel-art"'
  >
>;
type _CanRunPixelArtMatrix = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/primitives/pixel-art-matrix/pixel-art-matrix'))['default'],
    never,
    'path: "pixel-art-matrix"'
  >
>;
type _CanRunExceptions = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/primitives/exceptions/exceptions'))['default'],
    never,
    'path: "exceptions"'
  >
>;
type _CanRunExceptionQueryParams = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/primitives/exceptions/exception-query-params'))['default'],
    never,
    'path: "exception-query-params"'
  >
>;
type _CanRunCraftQuery = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/craft/query/query'))['default'],
    'userId',
    'path: "craft/query/:userId"'
  >
>;
type _CanRunCraftMutation = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/craft/mutation/mutation'))['default'],
    'userId',
    'path: "craft/mutation/:userId"'
  >
>;
type _CanRunCraftListWithPagination = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/craft/list-with-pagination/list-with-pagination'))['default'],
    never,
    'path: "craft/list-with-pagination"'
  >
>;
type _CanRunCraftGranularMutation = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/craft/granular-mutation/granular-mutation'))['default'],
    never,
    'path: "craft/granular-mutation"'
  >
>;
type _CanRunCraftFullDemo = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/craft/full-demo/full-demo'))['default'],
    never,
    'path: "craft/full-demo"'
  >
>;
type _CanRunLazyLayout = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/craft/lazy-layout/lazy-layout'))['default'],
    'teamId' | 'someParentRouteData',
    'path: "craft/lazy-layout/:teamId"'
  >
>;
type _CanRunLoginForm = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/primitives/forms/login-form'))['default'],
    never,
    'path: "login-form"'
  >
>;
type _CanRunCraftServiceCounter = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/craft-service/craft-service-counter'))['default'],
    never,
    'path: "craft-service/counter"'
  >
>;
type _CanRunCraftServiceUserDetail = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/craft-service/craft-service-user-detail'))['default'],
    never,
    'path: "craft-service/user-detail"'
  >
>;
type _CanRunDemoSendContext = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/ia/demo-send-context/demo-send-context'))['default'],
    never,
    'path: "demo-send-context"'
  >
>;
type _CanRunPlayground = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/playground/playground'))['default'],
    never,
    'path: "playground"'
  >
>;
type _CanRunQueryParams = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/routes/list-with-pagination/qp-list-with-pagination'))['default'],
    never,
    'path: "query-params"'
  >
>;
type _CanRunGuardDemo = CanRun<
  DemoRouteCheckedDI<
    (typeof import('./examples/routes/guard-demo/GuardDemo'))['GuardDemo'],
    never,
    'path: "guard-demo"'
  >
>;

type ChildMountCheckedDI<
  ChildRoutes,
  ParentPath extends string,
> = ChildRoutes extends {
  readonly __craftParentMount?: infer Mount extends string;
}
  ? [Mount] extends [ParentPath]
    ? true
    : [`Child routes pinned to "${Mount}" cannot mount at "${ParentPath}"`]
  : ['Expected a Craft routes collection'];

type _CanRunViewTransitionsMount = CanRun<
  ChildMountCheckedDI<
    (typeof import('./examples/routes/view-transitions/view-transitions.routes'))['viewTransitionsRoutes'],
    'view-transitions'
  >
>;
type _CanRunLazyLayoutMount = CanRun<
  ChildMountCheckedDI<
    (typeof import('./examples/craft/lazy-layout/lazy-layout.routes'))['lazyLayoutRoutes'],
    'craft/lazy-layout/:teamId'
  >
>;
