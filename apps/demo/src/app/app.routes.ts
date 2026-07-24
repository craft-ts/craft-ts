import type { ActivatedRoute, Router } from '@angular/router';
import {
  CraftRoutedComponentHost,
  provideCraftComponent,
} from '@craft-ng/component';
import {
  assertChildRouteMounts,
  assertExhaustiveRouteExceptions,
  craftExceptionHandler,
  craftRoute,
  craftRoutes,
  queryParams,
  type CanRun,
  type CraftRouteExceptionType,
  type ValidateCascadeRoutesFile,
} from '@craft-ng/core';
import CraftServiceCounter from './examples/craft-service/craft-service-counter';
import CraftServiceUserDetail from './examples/craft-service/craft-service-user-detail';
import CraftFullDemo from './examples/craft/full-demo/full-demo';
import CraftGranularMutation from './examples/craft/granular-mutation/granular-mutation';
import LazyLayout from './examples/craft/lazy-layout/lazy-layout';
import CraftList from './examples/craft/list-with-pagination/list-with-pagination';
import CraftMutation from './examples/craft/mutation/mutation';
import CraftQuery from './examples/craft/query/query';
import {
  componentDemo,
  type GenDeps_ComponentDemo,
} from './examples/component/component-demo';
import DemoSendContext from './examples/ia/demo-send-context/demo-send-context';
import Playground from './examples/playground/playground';
import ExceptionQueryParams from './examples/primitives/exceptions/exception-query-params';
import Exceptions from './examples/primitives/exceptions/exceptions';
import LoginForm from './examples/primitives/forms/login-form';
import FullDemo from './examples/primitives/full-demo/full-demo';
import GranularMutation from './examples/primitives/granular-mutation/granular-mutation';
import ListWithPagination from './examples/primitives/list-with-pagination/list-with-pagination';
import Mutation from './examples/primitives/mutation/mutation';
import PixelArtMatrix from './examples/primitives/pixel-art-matrix/pixel-art-matrix';
import PixelArt from './examples/primitives/pixel-art/pixel-art';
import Query from './examples/primitives/query/query';
import QpList from './examples/routes/list-with-pagination/qp-list-with-pagination';
import { GuardDemo } from './examples/routes/guard-demo/GuardDemo';
import { authGuard } from './guard/auth.guard';

const mounted = (
  component: Parameters<typeof provideCraftComponent>[0],
) => {
  return {
    component: CraftRoutedComponentHost,
    providers: [provideCraftComponent(component)],
  };
};

export const { demoRoutes } = craftRoutes('demo', [
  {
    path: 'query/:userId',
    componentDeps:
      {} as import('./examples/primitives/query/query').GenDeps_GlobalQuery,
    ...mounted(Query),
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
    componentDeps: {} as GenDeps_ComponentDemo,
    ...mounted(componentDemo),
  },
  {
    path: 'mutation/:userId',
    componentDeps:
      {} as import('./examples/primitives/mutation/mutation').GenDeps_GlobalQuery,
    ...mounted(Mutation),
  },
  {
    path: 'list-with-pagination',
    componentDeps:
      {} as import('./examples/primitives/list-with-pagination/list-with-pagination').GenDeps_ListWithPagination,
    ...mounted(ListWithPagination),
  },
  {
    path: 'granular-mutation',
    componentDeps:
      {} as import('./examples/primitives/granular-mutation/granular-mutation').GenDeps_GranularMutation,
    ...mounted(GranularMutation),
  },
  {
    path: 'full-demo',
    componentDeps:
      {} as import('./examples/primitives/full-demo/full-demo').GenDeps_FullDemo,
    ...mounted(FullDemo),
  },
  {
    path: 'pixel-art',
    componentDeps:
      {} as import('./examples/primitives/pixel-art/pixel-art').GenDeps_PixelArt,
    ...mounted(PixelArt),
  },
  {
    path: 'pixel-art-matrix',
    componentDeps:
      {} as import('./examples/primitives/pixel-art-matrix/pixel-art-matrix').GenDeps_PixelArtMatrix,
    ...mounted(PixelArtMatrix),
  },
  {
    path: 'exceptions',
    componentDeps:
      {} as import('./examples/primitives/exceptions/exceptions').GenDeps_ExceptionsComponent,
    ...mounted(Exceptions),
  },
  {
    path: 'exception-query-params',
    componentDeps:
      {} as import('./examples/primitives/exceptions/exception-query-params').GenDeps_ExceptionQueryParamsComponent,
    ...mounted(ExceptionQueryParams),
  },
  {
    path: 'craft/query/:userId',
    componentDeps:
      {} as import('./examples/craft/query/query').GenDeps_GlobalQuery,
    ...mounted(CraftQuery),
  },
  {
    path: 'craft/mutation/:userId',
    componentDeps:
      {} as import('./examples/craft/mutation/mutation').GenDeps_MutationCraft,
    ...mounted(CraftMutation),
  },
  {
    path: 'craft/list-with-pagination',
    componentDeps:
      {} as import('./examples/craft/list-with-pagination/list-with-pagination').GenDeps_ListWithPaginationCraft,
    ...mounted(CraftList),
  },
  {
    path: 'craft/granular-mutation',
    componentDeps:
      {} as import('./examples/craft/granular-mutation/granular-mutation').GenDeps_GranularMutationCraft,
    ...mounted(CraftGranularMutation),
  },
  {
    path: 'craft/full-demo',
    componentDeps:
      {} as import('./examples/craft/full-demo/full-demo').GenDeps_FullDemoCraft,
    ...mounted(CraftFullDemo),
  },
  {
    path: 'craft/lazy-layout/:teamId',
    data: { someParentRouteData: 'foo' },
    componentDeps:
      {} as import('./examples/craft/lazy-layout/lazy-layout').GenDeps_LazyLayoutComponent,
    component: CraftRoutedComponentHost,
    providers: [provideCraftComponent(LazyLayout)],
    loadChildren: ({ withRetry }) =>
      withRetry(import('./examples/craft/lazy-layout/lazy-layout.routes')).then(
        (module) => module.lazyLayoutRoutes,
      ),
  },
  {
    path: 'login-form',
    componentDeps:
      {} as import('./examples/primitives/forms/login-form').GenDeps_LoginFormComponent,
    ...mounted(LoginForm),
  },
  {
    path: 'craft-service/counter',
    componentDeps:
      {} as import('./examples/craft-service/craft-service-counter').GenDeps_CraftServiceCounterComponent,
    ...mounted(CraftServiceCounter),
  },
  {
    path: 'craft-service/user-detail',
    componentDeps:
      {} as import('./examples/craft-service/craft-service-user-detail').GenDeps_CraftServiceUserDetailComponent,
    ...mounted(CraftServiceUserDetail),
  },
  {
    path: 'demo-send-context',
    componentDeps:
      {} as import('./examples/ia/demo-send-context/demo-send-context').GenDeps_DemoSendContextComponent,
    ...mounted(DemoSendContext),
  },
  {
    path: 'playground',
    componentDeps:
      {} as import('./examples/playground/playground').GenDeps_PlaygroundComponent,
    ...mounted(Playground),
  },
  {
    path: 'query-params',
    componentDeps:
      {} as import('./examples/routes/list-with-pagination/qp-list-with-pagination').GenDeps_QpListWithPagination,
    ...mounted(QpList),
    queryParams: () =>
      queryParams(
        {
          state: {
            page: { fallbackValue: 1, parse: Number, serialize: String },
            pageSize: { fallbackValue: 4, parse: Number, serialize: String },
          },
        },
        ({ patch, state }) => ({
          nextPage: () => patch({ page: state().page + 1 }),
          previousPage: () => patch({ page: state().page - 1 }),
          updatePageSize: (pageSize: number) =>
            patch({ pageSize, page: 1 }),
        }),
      ),
  },
  craftRoute(
    'guard-demo',
    {
      componentDeps:
        {} as import('./examples/routes/guard-demo/GuardDemo').GenDeps_GuardDemo,
      ...mounted(GuardDemo),
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
assertChildRouteMounts(demoRoutes);

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

type _CheckDemoDI = ValidateCascadeRoutesFile<
  'CraftRouter',
  Router | ActivatedRoute,
  typeof demoRoutes
>;
type _CanRunDemo = CanRun<_CheckDemoDI>;
