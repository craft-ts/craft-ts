import type { Router } from '@angular/router';
import {
  CraftRoutedComponentHost,
  provideCraftComponent,
} from '@craft-ng/component';
import {
  assertExhaustiveRouteExceptions,
  craftRoutes,
  type CanRun,
  type ParentRoutes,
  type ValidateCascadeRoutesFile,
} from '@craft-ng/core';
import LazyLayoutChild from './lazy-layout-child';

export const { lazyLayoutRoutes } = craftRoutes('lazyLayout', [
  {
    path: 'users/:userId',
    component: CraftRoutedComponentHost,
    providers: [provideCraftComponent(LazyLayoutChild)],
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
