import { craftRoutes, queryParam } from '@craft-ng/core';

export const {
  demoRoutes,
  injectDemoTeamIdParams,
  injectDemoCraftLazyLayoutTeamIdData,
  injectDemoUserIdParams,
  injectDemoQueryParamQueryParams,
} = craftRoutes('demo', [
  {
    path: '',
    loadComponent: () => import('./test'),
    componentDeps: {} as import('./test').GenDeps_TestComponent,
  },
  {
    path: 'query/:userId',
    componentDeps:
      {} as import('./examples/primitives/query/query').GenDeps_GlobalQuery,
    loadComponent: () => import('./examples/primitives/query/query'),
  },
  {
    path: 'mutation/:userId',
    componentDeps:
      {} as import('./examples/primitives/mutation/mutation').GenDeps_GlobalQuery,
    loadComponent: () => import('./examples/primitives/mutation/mutation'),
  },
  {
    path: 'list-with-pagination',
    componentDeps:
      {} as import('./examples/primitives/list-with-pagination/list-with-pagination').GenDeps_ListWithPagination,
    loadComponent: () =>
      import('./examples/primitives/list-with-pagination/list-with-pagination'),
  },
  {
    path: 'granular-mutation',
    componentDeps:
      {} as import('./examples/primitives/granular-mutation/granular-mutation').GenDeps_GranularMutation,
    loadComponent: () =>
      import('./examples/primitives/granular-mutation/granular-mutation'),
  },
  {
    path: 'full-demo',
    componentDeps:
      {} as import('./examples/primitives/full-demo/full-demo').GenDeps_FullDemo,
    loadComponent: () => import('./examples/primitives/full-demo/full-demo'),
  },
  {
    path: 'pixel-art',
    componentDeps:
      {} as import('./examples/primitives/pixel-art/pixel-art').GenDeps_PixelArt,
    loadComponent: () => import('./examples/primitives/pixel-art/pixel-art'),
  },
  {
    path: 'pixel-art-matrix',
    componentDeps:
      {} as import('./examples/primitives/pixel-art-matrix/pixel-art-matrix').GenDeps_PixelArtMatrix,
    loadComponent: () =>
      import('./examples/primitives/pixel-art-matrix/pixel-art-matrix'),
  },
  {
    path: 'exceptions',
    componentDeps:
      {} as import('./examples/primitives/exceptions/exceptions').GenDeps_ExceptionsComponent,
    loadComponent: () => import('./examples/primitives/exceptions/exceptions'),
  },
  {
    path: 'exception-query-param',
    componentDeps:
      {} as import('./examples/primitives/exceptions/exception-query-param').GenDeps_ExceptionQueryParamComponent,
    loadComponent: () =>
      import('./examples/primitives/exceptions/exception-query-param'),
  },
  {
    path: 'craft/query/:userId',
    componentDeps:
      {} as import('./examples/craft/query/query').GenDeps_GlobalQuery,
    loadComponent: () => import('./examples/craft/query/query'),
  },
  {
    path: 'craft/mutation/:userId',
    componentDeps:
      {} as import('./examples/craft/mutation/mutation').GenDeps_MutationCraft,
    loadComponent: () => import('./examples/craft/mutation/mutation'),
  },
  {
    path: 'craft/list-with-pagination',
    componentDeps:
      {} as import('./examples/craft/list-with-pagination/list-with-pagination').GenDeps_ListWithPaginationCraft,
    loadComponent: () =>
      import('./examples/craft/list-with-pagination/list-with-pagination'),
  },
  {
    path: 'craft/granular-mutation',
    componentDeps:
      {} as import('./examples/craft/granular-mutation/granular-mutation').GenDeps_GranularMutationCraft,
    loadComponent: () =>
      import('./examples/craft/granular-mutation/granular-mutation'),
  },
  {
    path: 'craft/full-demo',
    componentDeps:
      {} as import('./examples/craft/full-demo/full-demo').GenDeps_FullDemoCraft,
    loadComponent: () => import('./examples/craft/full-demo/full-demo'),
  },
  {
    path: 'craft/lazy-layout/:teamId',
    data: {
      someParentRouteData: 'foo',
    },
    loadComponent: () => import('./examples/craft/lazy-layout/lazy-layout'),
    componentDeps:
      {} as import('./examples/craft/lazy-layout/lazy-layout').GenDeps_LazyLayoutComponent,
    loadChildren: () =>
      import('./examples/craft/lazy-layout/lazy-layout.routes').then(
        (m) => m.lazyLayoutRoutes,
      ),
  },
  {
    path: 'login-form',
    componentDeps:
      {} as import('./examples/primitives/forms/login-form').GenDeps_LoginFormComponent,
    loadComponent: () => import('./examples/primitives/forms/login-form'),
  },
  {
    path: 'craft-service/counter',
    componentDeps:
      {} as import('./examples/craft-service/craft-service-counter').GenDeps_CraftServiceCounterComponent,
    loadComponent: () =>
      import('./examples/craft-service/craft-service-counter'),
  },
  {
    path: 'craft-service/user-detail',
    componentDeps:
      {} as import('./examples/craft-service/craft-service-user-detail').GenDeps_CraftServiceUserDetailComponent,
    loadComponent: () =>
      import('./examples/craft-service/craft-service-user-detail'),
  },
  {
    path: 'playground',
    componentDeps:
      {} as import('./examples/playground/playground').GenDeps_PlaygroundComponent,
    loadComponent: () => import('./examples/playground/playground'),
  },
  {
    path: 'query-param',
    componentDeps:
      {} as import('./examples/routes/list-with-pagination/qp-list-with-pagination').GenDeps_QpListWithPagination,
    loadComponent: () =>
      import('./examples/routes/list-with-pagination/qp-list-with-pagination'),
    queryParams: () =>
      queryParam(
        {
          state: {
            page: {
              fallbackValue: 1,
              parse: (value) => parseInt(value, 10),
              serialize: (value) => String(value),
            },
            pageSize: {
              fallbackValue: 4,
              parse: (value) => parseInt(value, 10),
              serialize: (value) => String(value),
            },
          },
        },
        ({ patch, state }) => ({
          nextPage: () => patch({ page: state().page + 1 }),
          previousPage: () => patch({ page: state().page - 1 }),
          updatePageSize: (newPageSize: number) =>
            patch({ pageSize: newPageSize, page: 1 }),
        }),
      ),
  },
]);

declare module '@craft-ng/core' {
  interface CraftRouterRoutesRegistry {
    Demo: typeof demoRoutes.META_PATHS;
  }
}
