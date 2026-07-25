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
  HOST_TAG_LIST,
  HostTagToYield,
  injectPrimitiveMethodRuntimeContext,
  provideCorrelationIdTracking,
  provideCraftRouter,
  provideFnWrapObserver,
  provideFnWrapper,
  providePrimitiveResourceRuntimeObserver,
  provideSendContextToAi,
  provideTakeAppSnapshot,
  withCraftViewTransitions,
  withErrorComponent,
  withRouteLoadError,
  withTransitionTimings,
  type CanRun,
  type ComponentDepsOf,
  type RouteExceptionComponentCheckedDI,
} from '@craft-ng/core';
import {
  CraftGlobalErrorComponentHost,
  CraftRouteLoadErrorComponentHost,
  provideCraftRootComponent,
  provideCraftGlobalErrorComponent,
  provideCraftRouteLoadErrorComponent,
} from '@craft-ng/component';
import { demoRoutes } from './app.routes';
import {
  FUNCTION_REGISTRY_BRIDGE_URL,
  FUNCTION_REGISTRY_CLIENT_ID,
  startFunctionRegistryBridge,
} from './function-registry-bridge';
import {
  buildFunctionRegistryKey,
  functionRegistry,
  getFunctionEntryByKey,
  registerFunctionEntry,
  registerResourceEntry,
} from './function-registry';
import { provideLogForwarding } from './log-forwarder';
import { MyGlobalErrorScreen } from './my-global-error-screen';
import { MyRouteLoadErrorScreen } from './my-route-load-error-screen';
import { injectAppStartLog } from './run-on-app-start/run-on-app-start';
import { App } from './app';

export const appConfig = craftAppConfig({
  appStart: {
    AppStartLog: injectAppStartLog,
  },
  // Component DI is checked from each SFC contract; the app config only needs
  // the slim path registry and avoids re-expanding every component graph.
  routingDeps: demoRoutes.META_PATHS,
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Overrides the craft ConsoleService: every Console.* call keeps printing
    // in the browser and is also shipped to the local log server, where the
    // logs MCP server can read it back.
    provideLogForwarding(),
    provideCraftRootComponent(App),
    provideCraftGlobalErrorComponent(MyGlobalErrorScreen),
    provideCraftRouteLoadErrorComponent(MyRouteLoadErrorScreen),
    provideAppInitializer(() => {
      // Bootstrap boundary: the bridge lifetime follows the application injector.
      // eslint-disable-next-line craft-ng/no-angular-inject
      const destroyRef = inject(DestroyRef);
      const stopBridge = startFunctionRegistryBridge({
        // eslint-disable-next-line craft-ng/no-angular-inject
        injector: inject(Injector),
        // eslint-disable-next-line craft-ng/no-angular-inject
        url: inject(FUNCTION_REGISTRY_BRIDGE_URL),
        // eslint-disable-next-line craft-ng/no-angular-inject
        clientId: inject(FUNCTION_REGISTRY_CLIENT_ID),
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
        component: CraftGlobalErrorComponentHost,
      }),
      withRouteLoadError({
        component: CraftRouteLoadErrorComponentHost,
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
          yield* Console.error(error);
          throw error;
        }
      },
    ),
    // Timing
    provideFnWrapper(
      'Warning: dependency injection here is not type-safe and may fail at runtime',
      function* (factory, thisArg, args) {
        // eslint-disable-next-line craft-ng/prefer-browser-boundaries
        const start = performance.now();
        try {
          return yield* factory.apply(thisArg, args);
        } finally {
          const name = yield* HostTagToYield();
          // eslint-disable-next-line craft-ng/prefer-browser-boundaries
          console.log(`$${name} took ${performance.now() - start}ms`);
        }
      },
    ),
    provideCorrelationIdTracking(),
    provideSendContextToAi(),
    // App snapshot
    // TODO RENAME
    // eslint-disable-next-line craft-ng/prefer-browser-boundaries
    provideTakeAppSnapshot((data) => console.warn('App snapshot:', data)),
    provideFnWrapObserver((factory) => {
      const runtimeContext = injectPrimitiveMethodRuntimeContext();
      if (runtimeContext !== undefined) {
        ensureFunctionRegistryEntry(factory, undefined, runtimeContext);
      }
    }),
    providePrimitiveResourceRuntimeObserver((resourceContext) => {
      ensureResourceRegistryEntry(resourceContext);
    }),
    provideFnWrapper(
      'Warning: dependency injection here is not type-safe and may fail at runtime',
      function* (factory, thisArg, args) {
        const runtimeContext = injectPrimitiveMethodRuntimeContext();
        const key = ensureFunctionRegistryEntry(
          factory,
          thisArg,
          runtimeContext,
        );
        const override = functionRegistry.executeOverride(
          key,
          args,
          runtimeContext,
        );
        if (override.matched) {
          return override.result;
        }
        return yield* factory.apply(thisArg, args);
      },
    ),
  ],
});

type RegistryFactory = (...args: unknown[]) => unknown;

function ensureFunctionRegistryEntry(
  factory: RegistryFactory,
  thisArg: unknown,
  runtimeContext: ReturnType<typeof injectPrimitiveMethodRuntimeContext>,
): string {
  // eslint-disable-next-line craft-ng/no-angular-inject
  const hostTags = inject(HOST_TAG_LIST);
  const hostName = hostTags[hostTags.length - 1] ?? 'unknown';
  const ancestry = hostTags.slice(0, -1);
  const key = buildFunctionRegistryKey(hostName, ancestry);
  if (getFunctionEntryByKey(key) !== undefined) {
    return key;
  }

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
    runtimeContext,
  );
  destroyRef.onDestroy(cleanup);
  return key;
}

function ensureResourceRegistryEntry(
  resourceContext: Parameters<typeof registerResourceEntry>[2],
): string {
  // eslint-disable-next-line craft-ng/no-angular-inject
  const hostTags = inject(HOST_TAG_LIST);
  const hostName = hostTags[hostTags.length - 1] ?? 'unknown';
  const ancestry = hostTags.slice(0, -1);
  const key = buildFunctionRegistryKey(hostName, ancestry);
  if (getFunctionEntryByKey(key)?.primitive !== undefined) {
    return key;
  }

  // Primitive value boundary: expose the live primitive instance for dev-only MCP
  // reads and mutations.
  // eslint-disable-next-line craft-ng/no-angular-inject
  const destroyRef = inject(DestroyRef);
  const cleanup = registerResourceEntry(hostName, ancestry, resourceContext);
  destroyRef.onDestroy(cleanup);
  return key;
}

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
