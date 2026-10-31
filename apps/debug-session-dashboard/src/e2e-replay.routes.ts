import { loadCraftComponent } from '@craft-ts/component';
import {
  assertExhaustiveRouteExceptions,
  craftRoute,
  craftRoutes,
  queryParams,
} from '@craft-ts/core';

export const { e2eReplayRoutes } = craftRoutes('e2e-replay', [
  craftRoute('', {
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./e2e-replay-route')).then(
        (module) => module.E2eReplayRoute,
      ),
    ),
    queryParams: function* () {
      return yield* queryParams('e2eReplay', {
        state: {
          source: {
            fallbackValue: '',
            codec: {
              decode: (value: string) => value,
              encode: (value: string) => value,
            },
          },
        },
      });
    },
  }),
]);
assertExhaustiveRouteExceptions(e2eReplayRoutes);
