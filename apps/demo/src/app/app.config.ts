import {
  afterEveryRender,
  inject,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { withComponentInputBinding } from '@angular/router';
import {
  Console,
  craftAppConfig,
  HostTagToYield,
  provideComponentMonitoring,
  provideCorrelationIdTracking,
  provideCraftRouter,
  provideFnWrapper,
  provideTakeAppSnapshot,
  ɵHOST_TAG_LIST,
} from '@craft-ng/core';
import { provideCraftDevTools } from '@craft-ng/runtime-dev-tools';
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
    provideComponentMonitoring(() => {
      //ts-ignore
      const name = inject(ɵHOST_TAG_LIST) as any;
      afterEveryRender(() => {
        console.log('render from app config', name);
      });
    }),
    // App snapshot
    // TODO RENAME
    // eslint-disable-next-line craft-ng/prefer-browser-boundaries
    provideTakeAppSnapshot((data) => console.warn('App snapshot:', data)),
    provideCraftDevTools(),
  ],
});
