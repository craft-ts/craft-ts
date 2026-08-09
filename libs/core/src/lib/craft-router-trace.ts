import {
  inject,
  InjectionToken,
  Injector,
  provideAppInitializer,
  runInInjectionContext,
  type EnvironmentProviders,
  type Provider,
} from '@angular/core';
import { Router, type Event as AngularRouterEvent } from '@angular/router';
import type { CraftRoutePhase } from './craft-route-exceptions';

export type CraftRouterTraceStage =
  | 'match'
  | 'guard'
  | 'resolve'
  | 'exceptionHandler';

export type CraftRouterTraceContext = Readonly<{
  kind: 'routerEvent' | 'routeChain' | 'routeStage';
  phase: 'event' | 'run';
  eventName?: string;
  event?: AngularRouterEvent;
  stage?: CraftRouterTraceStage;
  routePhase?: CraftRoutePhase;
  url?: string;
}>;

export type CraftRouterTraceWrapper = (
  context: CraftRouterTraceContext,
  next: () => unknown,
) => unknown;

export const CRAFT_ROUTER_TRACE = new InjectionToken<
  readonly CraftRouterTraceWrapper[]
>('CRAFT_ROUTER_TRACE', {
  providedIn: 'root',
  factory: () => [],
});

const routerTraceListeners = new WeakSet<Injector>();

export function provideCraftRouterTrace(
  wrapper: CraftRouterTraceWrapper,
): (Provider | EnvironmentProviders)[] {
  return [
    {
      provide: CRAFT_ROUTER_TRACE,
      useValue: wrapper,
      multi: true,
    },
    provideAppInitializer(() => {
      const injector = inject(Injector);
      const router = inject(Router);

      if (routerTraceListeners.has(injector)) {
        return;
      }
      routerTraceListeners.add(injector);

      router.events.subscribe((event) => {
        executeCraftRouterTrace(
          injector,
          {
            kind: 'routerEvent',
            phase: 'event',
            eventName: event.constructor.name,
            event,
            url:
              'url' in event && typeof event.url === 'string'
                ? event.url
                : undefined,
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
  const wrappers = injector.get(CRAFT_ROUTER_TRACE, []);
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
