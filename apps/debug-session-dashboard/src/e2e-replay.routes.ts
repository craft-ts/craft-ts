import { loadCraftComponent } from '@craft-ts/component';
import { craftRoute, craftRoutes } from '@craft-ts/core';

export const { e2eReplayRoutes } = craftRoutes('e2e-replay', [
  craftRoute('', {
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./e2e-replay-route')).then(
        (module) => module.E2eReplayRoute,
      ),
    ),
  }),
]);
