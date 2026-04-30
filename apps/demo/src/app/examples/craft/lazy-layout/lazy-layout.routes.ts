import { craftRoutes } from '@craft-ng/core';

export const {
  appRoutes: lazyLayoutAppRoutes,
} = craftRoutes([
  {
    path: 'users/:userId',
    loadComponent: () => import('./lazy-layout'),
    componentDeps: {} as import('./lazy-layout').GenDeps_LazyLayoutComponent,
  },
]);
