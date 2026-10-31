import {
  provideCraftGlobalErrorComponent,
  provideCraftRootComponent,
  provideCraftRouteLoadErrorComponent,
  provideCraftDebugSessionCapture,
  provideCraftDebugReplayBridge,
  provideCraftLoopGuard,
  provideSendContextToAi,
} from '@craft-ts/component';
import {
  Console,
  CraftCircularDependencyError,
  craftAppConfig,
  isCraftGenShortCircuit,
  isCraftNotSettled,
  provideCorrelationIdTracking,
  provideCraftRouter,
  provideSendContextEventEnricher,
  provideGlobalPersisterHandlerService,
  provideLocalStoragePersister,
  provideSessionStoragePersister,
  provideStorageService,
  provideStoragePersister,
  LocalStoragePersister,
  SessionStorageService,
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
} from '@craft-ts/core';
import { App } from './app';
import { demoRoutes } from './app.routes';
import { provideMcpExperimentation } from './function-registry-entry';
import { provideLogForwarding, provideLogServerUrl } from './log-forwarder';
import { MyGlobalErrorScreen } from './my-global-error-screen';
import { MyRouteLoadErrorScreen } from './my-route-load-error-screen';
import { AppStartLog } from './run-on-app-start/run-on-app-start';

const localLogServerUrl =
  import.meta.env['VITE_CRAFT_LOG_SERVER_URL'] ?? 'http://127.0.0.1:4319';
const localReplayDashboardOrigin =
  import.meta.env['VITE_CRAFT_REPLAY_DASHBOARD_ORIGIN'] ??
  'http://localhost:4210';
const localSessionCaptureEnabled = isLoopbackUrl(localLogServerUrl);

const developmentProviders = import.meta.env.DEV
  ? [
      // The log server, tracing, snapshots and MCP bridge are deliberately
      // absent from the production graph.
      provideLogServerUrl(() => `${localLogServerUrl}/logs`),
      provideLogForwarding(),
      // provideDemoTracing(), // Used to track everything
      // eslint-disable-next-line craft-ts/prefer-browser-boundaries
      provideTakeAppSnapshot((data) => console.warn('App snapshot:', data)),
      provideSendContextEventEnricher((event) => ({
        ...event,
        application: 'demo',
      })),
      provideCraftDebugSessionCapture({
        webSocketUrl: `${localLogServerUrl.replace(/^http/, 'ws')}/sessions/ws`,
        captureInputValues: localSessionCaptureEnabled,
        captureSensitiveInputValues: localSessionCaptureEnabled,
        captureBrowserStorage: localSessionCaptureEnabled,
        captureReplayArguments: localSessionCaptureEnabled,
      }),
      provideCraftDebugReplayBridge({
        parentOrigins: [
          localReplayDashboardOrigin,
          localReplayDashboardOrigin.replace('localhost', '127.0.0.1'),
        ],
      }),
      provideCraftLoopGuard({
        tripBreaker: true,
        // This route deliberately renders 13 independent counter services;
        // keep the leak guard's default threshold meaningful everywhere else.
        exempt: {
          'state:counter in component:App / component:CraftRouterOutlet / service:craftRouterOutletState / route:demo-send-context / component:DemoSendContextComponent / component:SendContextCounterComponent / service:sendContextCounterView':
            {
              leakedInstances: 20,
            },
        },
      }),
      provideSendContextToAi({ recording: false, capture: false }),
      provideMcpExperimentation(),
    ]
  : [];

export const appConfig = craftAppConfig({
  appStart: {
    AppStartLog,
  },
  providers: [
    ...developmentProviders,
    provideGlobalPersisterHandlerService(),
    provideLocalStoragePersister(),
    provideSessionStoragePersister(),
    provideStoragePersister(function* () {
      return yield* LocalStoragePersister();
    }),
    provideStorageService(function* () {
      return yield* SessionStorageService();
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
          // `catchNode`, a `CraftNotSettled` to a `pendingNode`. Converting
          // them to an `UNEXPECTED_ERROR` strands them — the boundary never
          // sees them and the fabricated exception renders in their place.
          if (isCraftGenShortCircuit(error) || isCraftNotSettled(error)) {
            throw error;
          }
          if (error instanceof CraftCircularDependencyError) {
            throw error;
          }
          yield* Console.error(error);
          return craftException({ _tag: 'UNEXPECTED_ERROR' }, { error: error });
        }
      },
    ),
    provideCorrelationIdTracking(),
  ],
});

function isLoopbackUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.replace(/^\[|\]$/g, '');
    return (
      hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
    );
  } catch {
    return false;
  }
}

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
