import { loadCraftComponent } from '@craft-ts/component';
import {
  assertExhaustiveRouteExceptions,
  craftExceptionHandler,
  craftRoutes,
} from '@craft-ts/core';

export const { demoEffectRoutes } = craftRoutes('demo-effect', [
  {
    path: '',
    ...loadCraftComponent(({ withRetry }) =>
      withRetry(import('./examples/effect/effect-yield')).then(
        ({ default: component }) => component,
      ),
    ),
    handleExceptions: {
      UserNotFound: craftExceptionHandler(function* ({ globalError }) {
        return globalError();
      }),
      Unauthorized: craftExceptionHandler(function* ({ globalError }) {
        return globalError();
      }),
    },
  },
]);

assertExhaustiveRouteExceptions(demoEffectRoutes);
