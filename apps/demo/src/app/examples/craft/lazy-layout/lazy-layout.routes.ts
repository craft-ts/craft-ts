import { craftRoutes } from '@craft-ng/core';

export const { lazyLayoutRoutes } = craftRoutes('lazyLayout', [
  {
    path: 'users/:userId',
    loadComponent: () => import('./lazy-layout-child'),
    componentDeps:
      {} as import('./lazy-layout-child').GenDeps_LazyLayoutChildComponent,
  },
]);
