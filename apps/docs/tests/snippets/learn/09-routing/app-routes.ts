// #region app-routes
import { loadCraftComponent } from '@craft-ts/component';
import { craftRoutes } from '@craft-ts/core';

export const { appRoutes } = craftRoutes('app', [
  {
    path: 'tasks',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./tasks/tasks')).then(
        ({ default: component }) => component,
      ),
    ),
  },
]);
// #endregion app-routes

// The typed path registry the router helpers read. In a real application the
// craft-ts ESLint plugin writes this block for you.
declare module '@craft-ts/core' {
  interface CraftRouterRoutesRegistry {
    LearnRoutingRoutes: readonly [{ path: 'tasks' }, { path: 'tasks/:taskId' }];
  }
}
