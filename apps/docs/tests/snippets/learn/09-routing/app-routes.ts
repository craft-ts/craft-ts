// #region app-routes
import { loadCraftComponent } from '@craft-ng/component';
import { craftRoutes } from '@craft-ng/core';

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
