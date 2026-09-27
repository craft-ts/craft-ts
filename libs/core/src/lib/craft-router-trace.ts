import {
  inject,
  Injector,
  provideAppInitializer,
  runInInjectionContext,
  type EnvironmentProviders,
  type Provider,
} from './host/craft-compat';
import { craftService } from './craft-service';
import type { CraftRoutePhase } from './craft-route-exceptions';
import { isCraftDevelopment } from './craft-runtime-mode';
import { ɵinjectCraftRouterRuntime, type CraftRouterEvent } from './craft-router-tokens';

export type CraftRouterTraceStage =
  | 'match'
  | 'guard'
  | 'resolve'
  | 'exceptionHandler';

export type CraftRouterTraceContext = Readonly<{
  kind: 'routerEvent' | 'routeChain' | 'routeStage';
  phase: 'event' | 'run';
  eventName?: string;
  event?: CraftRouterEvent;
  stage?: CraftRouterTraceStage;
  routePhase?: CraftRoutePhase;
  url?: string;
}>;

export type CraftRouterTraceWrapper = (
  context: CraftRouterTraceContext,
  next: () => unknown,
) => unknown;

const craftRouterTraceService = craftService(
  { name: 'CraftRouterTraces', providedIn: 'toProvide', collection: true },
  (inputs: { $provided?: CraftRouterTraceWrapper }) =>
    inputs.$provided ? [inputs.$provided] : [],
) as unknown as {
  provideCraftRouterTraces: (value?: CraftRouterTraceWrapper) => unknown;
  CRAFT_ROUTER_TRACES_META_DATA: { inject(): readonly CraftRouterTraceWrapper[] };
};

export const ɵinjectCraftRouterTraces = (
  injector?: Injector,
): readonly CraftRouterTraceWrapper[] => {
  try {
    return injector
      ? runInInjectionContext(injector, () =>
          craftRouterTraceService.CRAFT_ROUTER_TRACES_META_DATA.inject(),
        )
      : craftRouterTraceService.CRAFT_ROUTER_TRACES_META_DATA.inject();
  } catch {
    return [];
  }
};

const routerTraceListeners = new WeakSet<Injector>();

type CraftRouterEvents = {
  subscribe(fn: (event: CraftRouterEvent) => void): { unsubscribe(): void };
};

function craftRouterEvents(router: object): CraftRouterEvents | undefined {
  const events = (router as { events?: CraftRouterEvents }).events;
  return events && typeof events.subscribe === 'function' ? events : undefined;
}

export function provideCraftRouterTrace(
  wrapper: CraftRouterTraceWrapper,
): (Provider | EnvironmentProviders)[] {
  return [
    craftRouterTraceService.provideCraftRouterTraces(wrapper) as Provider,
    provideAppInitializer(() => {
      const injector = inject(Injector);
      if (!isCraftDevelopment(injector)) {
        return;
      }
      const router = ɵinjectCraftRouterRuntime();
      const events = router ? craftRouterEvents(router) : undefined;

      if (!events || routerTraceListeners.has(injector)) {
        return;
      }
      routerTraceListeners.add(injector);

      events.subscribe((event) => {
        executeCraftRouterTrace(
          injector,
          {
            kind: 'routerEvent',
            phase: 'event',
            eventName: event.type,
            event,
            url: event.url,
          },
          () => undefined,
        );
      });
    }),
  ];
}

export function executeCraftRouterTrace<Value>(
  injector: Injector,
  context: CraftRouterTraceContext,
  next: () => Value,
): Value {
  if (!isCraftDevelopment(injector)) {
    return next();
  }
  const wrappers = ɵinjectCraftRouterTraces(injector);
  if (wrappers.length === 0) {
    return next();
  }

  const run = (index: number): Value => {
    if (index === wrappers.length) {
      return next();
    }

    const wrapper = wrappers[index];
    return wrapper(context, () => run(index + 1)) as Value;
  };

  return runInInjectionContext(injector, () => run(0));
}
