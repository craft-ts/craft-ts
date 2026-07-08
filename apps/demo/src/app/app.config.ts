import {
  DestroyRef,
  inject,
  Injector,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { withComponentInputBinding } from '@angular/router';
import {
  Console,
  craftAppConfig,
  executeGeneratorCompatibleFactory,
  HostTagToYield,
  provideCorrelationIdTracking,
  provideCraftRouter,
  provideFnWrapper,
  provideSendContextToAi,
  provideTakeAppSnapshot,
  withCraftViewTransitions,
  withErrorComponent,
  withRouteLoadError,
  withTransitionTimings,
  type CanRun,
  type RouteExceptionComponentCheckedDI,
} from '@craft-ng/core';
import { demoRoutes } from './app.routes';
import {
  FUNCTION_REGISTRY_BRIDGE_URL,
  startFunctionRegistryBridge,
} from './function-registry-bridge';
import { registerFunctionEntry } from './function-registry';
import { MyGlobalErrorScreen } from './my-global-error-screen';
import { MyRouteLoadErrorScreen } from './my-route-load-error-screen';
import { injectAppStartLog } from './run-on-app-start/run-on-app-start';

export const appConfig = craftAppConfig({
  appStart: {
    AppStartLog: injectAppStartLog,
  },
  routingDeps: demoRoutes.META_DATA,
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideAppInitializer(() => {
      // Bootstrap boundary: the bridge lifetime follows the application injector.
      // eslint-disable-next-line craft-ng/no-angular-inject
      const destroyRef = inject(DestroyRef);
      const stopBridge = startFunctionRegistryBridge({
        // eslint-disable-next-line craft-ng/no-angular-inject
        injector: inject(Injector),
        // eslint-disable-next-line craft-ng/no-angular-inject
        url: inject(FUNCTION_REGISTRY_BRIDGE_URL),
      });
      destroyRef.onDestroy(stopBridge);
    }),
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
      withErrorComponent({
        component: MyGlobalErrorScreen,
        componentDeps:
          {} as import('./my-global-error-screen').GenDeps_MyGlobalErrorScreen,
      }),
      withRouteLoadError({
        component: MyRouteLoadErrorScreen,
        componentDeps:
          {} as import('./my-route-load-error-screen').GenDeps_MyRouteLoadErrorScreen,
        retry: {
          attempts: 2,
          delayMs: 250,
        },
      }),
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
    provideFnWrapper(function* (factory, thisArg, args) {
      const hostTags = yield* HostTagToYield();
      const hostName = hostTags[hostTags.length - 1] ?? 'unknown';
      const ancestry = hostTags.slice(0, -1);
      // Wrapper boundary: retain the original scoped injector for remote replay.
      // eslint-disable-next-line craft-ng/no-angular-inject
      const destroyRef = inject(DestroyRef);
      // eslint-disable-next-line craft-ng/no-angular-inject
      const injector = inject(Injector);
      const cleanup = registerFunctionEntry(
        hostName,
        ancestry,
        (...registryArgs) =>
          executeGeneratorCompatibleFactory({
            factory,
            thisArg,
            getInjector: () => injector,
            args: registryArgs,
            invalidYieldErrorMessage:
              'Registry functions can only yield dependencies available in their original Craft context.',
            multipleAppStartErrorMessage:
              'Registry functions cannot declare multiple app-start hooks.',
            onAppStartNotSupportedErrorMessage:
              'Registry functions cannot declare app-start hooks.',
          }),
      );
      destroyRef.onDestroy(cleanup);
      return yield* factory.apply(thisArg, args);
    }),
  ],
});

type _CheckGlobalErrorDI = RouteExceptionComponentCheckedDI<
  import('./my-global-error-screen').GenDeps_MyGlobalErrorScreen,
  'CraftGlobalError',
  never,
  'global error component'
>;
type _CanRunGlobalError = CanRun<_CheckGlobalErrorDI>;

type _CheckGlobalRouteLoadErrorDI = RouteExceptionComponentCheckedDI<
  import('./my-route-load-error-screen').GenDeps_MyRouteLoadErrorScreen,
  'CraftRouteLoadError' | 'CraftRouteLoadRecovery',
  never,
  'global route load error component'
>;
type _CanRunGlobalRouteLoadError = CanRun<_CheckGlobalRouteLoadErrorDI>;
