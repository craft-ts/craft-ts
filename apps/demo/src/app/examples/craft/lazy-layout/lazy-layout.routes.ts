import {
  loadCraftComponent,
} from '@craft-ng/component';
import {
  assertExhaustiveRouteExceptions,
  craftRoutes,
  type CanRun,
  type ComponentDepsOf,
  type ParentRoutes,
  type RouteCheckedDI,
} from '@craft-ng/core';

export const { lazyLayoutRoutes } = craftRoutes('lazyLayout', [
  {
    path: 'users/:userId',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./lazy-layout-child')).then(
        ({ default: component }) => component,
      ),
    ),
  },
]).withParent<ParentRoutes<'craft/lazy-layout/:teamId'>>();
assertExhaustiveRouteExceptions(lazyLayoutRoutes);

type _CheckLazyLayoutDI = RouteCheckedDI<
  ComponentDepsOf<(typeof import('./lazy-layout-child'))['default']>,
  never,
  never,
  'component: craft/lazy-layout/:teamId/users/:userId',
  'teamId' | 'someParentRouteData'
>;
type _CanRunLazyLayout = CanRun<_CheckLazyLayoutDI>;
