import { loadCraftComponent } from '@craft-ts/component';
import { craftRoute, craftRoutes, assertExhaustiveRouteExceptions } from '@craft-ts/core';

export const { suiteRoutes } = craftRoutes('suite', [
  craftRoute('', {
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./suite-page')).then((module) => module.SuitePage),
    ),
  }),
]);
assertExhaustiveRouteExceptions(suiteRoutes);
