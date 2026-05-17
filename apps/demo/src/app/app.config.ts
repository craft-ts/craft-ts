import {
  afterEveryRender,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { withComponentInputBinding } from '@angular/router';
import {
  Console,
  craftAppConfig,
  provideComponentMonitoring,
  provideCorrelationIdTracking,
  provideCraftRouter,
  provideFnWrapper,
} from '@craft-ng/core';
import { demoRoutes } from './app.routes';
import { injectAppStartLog } from './run-on-app-start/run-on-app-start';

export const appConfig = craftAppConfig({
  appStart: {
    AppStartLog: injectAppStartLog,
  },
  routingDeps: demoRoutes.META_DATA,
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideCraftRouter(demoRoutes.toRoutes(), withComponentInputBinding()),
    provideFnWrapper(function* (factory, thisArg, args) {
      try {
        return yield* factory.apply(thisArg, args);
      } catch (error) {
        yield* Console.error(error);
        throw error;
      }
    }),
    // Timing
    provideFnWrapper(function* (factory, thisArg, args) {
      // eslint-disable-next-line craft-ng/prefer-browser-boundaries
      const start = performance.now();
      try {
        return yield* factory.apply(thisArg, args);
      } finally {
        // eslint-disable-next-line craft-ng/prefer-browser-boundaries
        console.log(`took ${performance.now() - start}ms`);
      }
    }),
    provideCorrelationIdTracking(),
    provideComponentMonitoring(function* () {
      yield* Console.log('Component initialized'); // inclut automatiquement from/tags
      const log = Console.log;
      afterEveryRender(() => {
        log('Component Re-Rendered'); // inclut automatiquement from/tags
      });
    }),
  ],
});
