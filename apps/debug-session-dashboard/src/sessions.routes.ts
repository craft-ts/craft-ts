import { loadCraftComponent } from '@craft-ts/component';
import { craftRoute, craftRoutes, assertExhaustiveRouteExceptions } from '@craft-ts/core';

export const { sessionsRoutes } = craftRoutes('sessions', [
  craftRoute('', {
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./sessions-page')).then(
        (module) => module.SessionsPage,
      ),
    ),
  }),
]);
assertExhaustiveRouteExceptions(sessionsRoutes);
