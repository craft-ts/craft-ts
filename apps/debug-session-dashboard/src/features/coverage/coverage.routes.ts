import { loadCraftComponent } from '@craft-ts/component';
import { craftRoute, craftRoutes, assertExhaustiveRouteExceptions } from '@craft-ts/core';

export const { coverageRoutes } = craftRoutes('coverage', [
  craftRoute('', {
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./coverage-page')).then(
        (module) => module.CoveragePage,
      ),
    ),
  }),
]);
assertExhaustiveRouteExceptions(coverageRoutes);
