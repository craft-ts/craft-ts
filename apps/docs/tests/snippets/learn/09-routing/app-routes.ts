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
