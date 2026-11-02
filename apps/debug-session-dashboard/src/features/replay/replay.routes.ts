import { loadCraftComponent } from '@craft-ts/component';
import { craftRoute, craftRoutes, assertExhaustiveRouteExceptions } from '@craft-ts/core';

export const { replayRoutes } = craftRoutes('replay', [
  craftRoute(':sessionId', {
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./replay-page')).then((module) => module.ReplayPage),
    ),
  }),
  // The /import route displays the replay surface without an archived session.
  craftRoute('', {
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./replay-page')).then((module) => module.ReplayPage),
    ),
  }),
]);
assertExhaustiveRouteExceptions(replayRoutes);
