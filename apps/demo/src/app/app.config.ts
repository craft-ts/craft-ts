import {
  provideCraftGlobalErrorComponent,
  provideCraftRootComponent,
  provideCraftRouteLoadErrorComponent,
} from '@craft-ng/component';
import {
  Console,
  craftAppConfig,
  isCraftGenShortCircuit,
  isCraftNotSettled,
  provideCorrelationIdTracking,
  provideCraftRouter,
  provideGlobalPersisterHandlerService,
  provideLocalStoragePersister,
  provideSessionStoragePersister,
  provideStoragePersister,
  LocalStoragePersister,
  provideFnWrapper,
  provideTakeAppSnapshot,
  withCraftViewTransitions,
  withA11yNavigationFocus,
  withErrorComponent,
  withRouteLoadError,
  withTransitionTimings,
  type AppProvidedDependencyValuesOf,
  type AppProvidedServiceNamesOf,
  type CanRun,
  type ComponentDepsOf,
  type RouteExceptionComponentCheckedDI,
  craftException,
  craftRouteTarget,
} from '@craft-ng/core';
import { App } from './app';
import { demoRoutes } from './app.routes.runtime';
import { provideMcpExperimentation } from './function-registry-entry';
import { provideLogForwarding } from './log-forwarder';
import { MyGlobalErrorScreen } from './my-global-error-screen';
import { MyRouteLoadErrorScreen } from './my-route-load-error-screen';
import { AppStartLog } from './run-on-app-start/run-on-app-start';
import { provideDemoTracing } from './template-trace-demo';

export const appConfig = craftAppConfig({
  appStart: {
    AppStartLog,
  },
  // Component DI is checked from each SFC contract; the app config only needs
  // the slim path registry and avoids re-expanding every component graph.
  routingDeps: demoRoutes.META_PATHS,
  providers: [
    // Overrides the craft ConsoleService: every Console.* call keeps printing
    // in the browser and is also shipped to the local log server, where the
    // logs MCP server can read it back.
    provideLogForwarding(),
    provideDemoTracing(),
    provideGlobalPersisterHandlerService(),
    provideLocalStoragePersister(),
    provideSessionStoragePersister(),
    provideStoragePersister(function* () {
      return yield* LocalStoragePersister();
    }),
    provideCraftRootComponent(App),
    provideCraftGlobalErrorComponent(MyGlobalErrorScreen),
    provideCraftRouteLoadErrorComponent(MyRouteLoadErrorScreen),
    // Routing + non-blocking outlet config in one provider.
    provideCraftRouter(
      demoRoutes.toRoutes(),
      // Outlet-driven View Transitions: unlike Angular's withViewTransitions()
      // (which brackets only the synchronous URL commit), the CraftRouterOutlet
      // drives document.startViewTransition() around its OWN swaps, so the
      // shared-element morph survives the non-blocking guard/resolve chain.
      // Showcased by the `view-transitions` demo (tile → skeleton → detail hero).
      withCraftViewTransitions(),
      withA11yNavigationFocus(),
      withErrorComponent({
        component: craftRouteTarget(MyGlobalErrorScreen),
      }),
      withRouteLoadError({
        component: craftRouteTarget(MyRouteLoadErrorScreen),
        retry: {
          attempts: 2,
          delayMs: 250,
        },
      }),
      // 3-phase transition: keep previous page 300ms, then blank 300ms, then
      // loader (held at least 500ms).
      withTransitionTimings({ stayMs: 300, blankMs: 300, pendingMinMs: 500 }),
    ),
    provideFnWrapper(
      'Warning: dependency injection here is not type-safe and may fail at runtime',
      function* (factory, thisArg, args) {
        try {
          return yield* factory.apply(thisArg, args);
        } catch (error) {
          // Control flow, not failure: a short-circuit is on its way to a
          // `catchBlock`, a `CraftNotSettled` to a `pendingBlock`. Converting
          // them to an `UNEXPECTED_ERROR` strands them — the boundary never
          // sees them and the fabricated exception renders in their place.
          if (isCraftGenShortCircuit(error) || isCraftNotSettled(error)) {
            throw error;
          }
          yield* Console.error(error);
          return craftException({ code: 'UNEXPECTED_ERROR' }, { error: error });
        }
      },
    ),
    provideCorrelationIdTracking(),
    //provideSendContextToAi(),
    // App snapshot
    // eslint-disable-next-line craft-ng/prefer-browser-boundaries
    provideTakeAppSnapshot((data) => console.warn('App snapshot:', data)),
    provideMcpExperimentation(),
  ],
});

export type AppProvidedNames = AppProvidedServiceNamesOf<typeof appConfig>;
export type AppProvidedValues = AppProvidedDependencyValuesOf<typeof appConfig>;

type _CheckGlobalErrorDI = RouteExceptionComponentCheckedDI<
  ComponentDepsOf<typeof MyGlobalErrorScreen>,
  'CraftGlobalError',
  never,
  'global error component'
>;
type _CanRunGlobalError = CanRun<_CheckGlobalErrorDI>;

type _CheckGlobalRouteLoadErrorDI = RouteExceptionComponentCheckedDI<
  ComponentDepsOf<typeof MyRouteLoadErrorScreen>,
  'CraftRouteLoadError' | 'CraftRouteLoadRecovery',
  never,
  'global route load error component'
>;
type _CanRunGlobalRouteLoadError = CanRun<_CheckGlobalRouteLoadErrorDI>;
