import { craftRoutes } from '@craft-ng/core';

export const { appRoutes: lazyLayoutAppRoutes } = craftRoutes([
  {
    path: 'users/:userId',
    loadComponent: () => import('./lazy-layout-child'),
    componentDeps:
      {} as import('./lazy-layout-child').GenDeps_LazyLayoutChildComponent,
  },
]);
