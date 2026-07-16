import type { Router } from '@angular/router';
import {
  assertExhaustiveRouteExceptions,
  craftRoutes,
  type CanRun,
  type ParentRoutes,
  type ValidateCascadeRoutesFile,
} from '@craft-ng/core';

export const { lazyLayoutRoutes } = craftRoutes('lazyLayout', [
  {
    path: 'users/:userId',
    loadComponent: ({ withRetry }) => withRetry(import('./lazy-layout-child')),
    componentDeps:
      {} as import('./lazy-layout-child').GenDeps_LazyLayoutChildComponent,
  },
]).withParent<ParentRoutes<'craft/lazy-layout/:teamId'>>();
assertExhaustiveRouteExceptions(lazyLayoutRoutes);

type _CheckLazyLayoutDI = ValidateCascadeRoutesFile<
  'DemoCraftLazyLayoutTeamIdData' | 'DemoTeamIdParams',
  Router,
  typeof lazyLayoutRoutes
>;
type _CanRunLazyLayout = CanRun<_CheckLazyLayoutDI>;

export type LazyLayoutRoutesAppDeps = typeof lazyLayoutRoutes.META_DATA;
