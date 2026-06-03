import { provideBrowserGlobalErrorListeners } from '@angular/core';
import { withComponentInputBinding } from '@angular/router';
import {
  Console,
  craftAppConfig,
  HostTagToYield,
  provideCorrelationIdTracking,
  provideCraftRouter,
  provideFnWrapper,
  provideSendContextToAi,
  provideTakeAppSnapshot,
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
        const name = yield* HostTagToYield();
        // eslint-disable-next-line craft-ng/prefer-browser-boundaries
        console.log(`$${name} took ${performance.now() - start}ms`);
      }
    }),
    provideCorrelationIdTracking(),
    provideSendContextToAi(),
    // App snapshot
    // TODO RENAME
    // eslint-disable-next-line craft-ng/prefer-browser-boundaries
    provideTakeAppSnapshot((data) => console.warn('App snapshot:', data)),
  ],
});
