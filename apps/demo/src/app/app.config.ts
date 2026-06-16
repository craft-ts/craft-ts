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
  withCraftViewTransitions,
  withErrorComponent,
  withTransitionTimings,
} from '@craft-ng/core';
import { demoRoutes } from './app.routes';
import { MyGlobalErrorScreen } from './my-global-error-screen';
import { injectAppStartLog } from './run-on-app-start/run-on-app-start';

export const appConfig = craftAppConfig({
  appStart: {
    AppStartLog: injectAppStartLog,
  },
  routingDeps: demoRoutes.META_DATA,
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Routing + non-blocking outlet config in one provider: Angular router
    // features and craft loading features (global error component, pending
    // thresholds) are mixed freely and split apart internally.
    provideCraftRouter(
      demoRoutes.toRoutes(),
      withComponentInputBinding(),
      // Outlet-driven View Transitions: unlike Angular's withViewTransitions()
      // (which brackets only the synchronous URL commit), the CraftRouterOutlet
      // drives document.startViewTransition() around its OWN swaps, so the
      // shared-element morph survives the non-blocking guard/resolve chain.
      // Showcased by the `view-transitions` demo (tile → skeleton → detail hero).
      withCraftViewTransitions(),
      withErrorComponent(MyGlobalErrorScreen),
      // 3-phase transition: keep previous page 300ms, then blank 300ms, then
      // loader (held at least 500ms).
      withTransitionTimings({ stayMs: 300, blankMs: 300, pendingMinMs: 500 }),
    ),
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
