import { craftRoutes, assertExhaustiveRouteExceptions } from '@craft-ng/core';

export const { lazyLayoutRoutes } = craftRoutes('lazyLayout', [
  {
    path: 'users/:userId',
    loadComponent: ({ withRetry }) => withRetry(import('./lazy-layout-child')),
    componentDeps:
      {} as import('./lazy-layout-child').GenDeps_LazyLayoutChildComponent,
  },
]);
assertExhaustiveRouteExceptions(lazyLayoutRoutes);

export type LazyLayoutRoutesAppDeps = typeof lazyLayoutRoutes.META_DATA;
