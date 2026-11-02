import { loadCraftComponent } from '@craft-ts/component';
import { craftRoute, craftRoutes, assertExhaustiveRouteExceptions } from '@craft-ts/core';

export const { comparisonRoutes } = craftRoutes('comparison', [
  craftRoute('', {
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./e2e-comparison-page')).then(
        (module) => module.E2eComparisonPage,
      ),
    ),
  }),
]);
assertExhaustiveRouteExceptions(comparisonRoutes);
