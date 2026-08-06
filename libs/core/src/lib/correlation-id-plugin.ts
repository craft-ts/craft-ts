import { DOCUMENT } from '@angular/common';
import {
  APP_INITIALIZER,
  inject,
  Injectable,
  Injector,
  runInInjectionContext,
  type Provider,
} from '@angular/core';
import {
  EVENT_MANAGER_PLUGINS,
  EventManagerPlugin,
} from '@angular/platform-browser';
import type { GetDeps } from './branded-component/branded-component';
import {
  CORRELATION_ID_SERVICE,
  createCorrelationIdService,
  getCurrentStartCorrelationId,
  setCurrentStartCorrelationId,
} from './correlation-id';
import { SERVICE_YIELD_REQUEST_MARKER } from './craft-generator-runtime';
import { provideFnWrapper, type FnWrapper } from './fn-wrapper';

@Injectable()
class CorrelationIdEventManagerPlugin extends EventManagerPlugin {
  private readonly injector = inject(Injector);

  constructor() {
    super(inject(DOCUMENT));
  }

  override supports(eventName: string): boolean {
    return eventName === 'click' || eventName === 'keydown';
  }

  override addEventListener(
    element: HTMLElement,
    eventName: string,
    handler: (event: Event) => void,
  ): () => void {
    const wrappedHandler = (event: Event) => {
      runInInjectionContext(this.injector, () => {
        const service = inject(CORRELATION_ID_SERVICE);
        if (service) {
          if (eventName === 'click') {
            service.generateAndSet('click');
          } else if (
            eventName === 'keydown' &&
            (event as KeyboardEvent).key === 'Enter'
          ) {
            service.generateAndSet('enter');
          }
        }
      });
      handler(event);
    };

    element.addEventListener(eventName, wrappedHandler);
    return () => element.removeEventListener(eventName, wrappedHandler);
  }
}

const POPSTATE_COUNTER_KEY = '__craftNgNavCounter';

function initPopstateTracking(injector: Injector): void {
  if (typeof window === 'undefined') return;

  // Initialize navigation counter in history state
  const currentState = window.history.state ?? {};
  const initialCounter = (currentState[POPSTATE_COUNTER_KEY] as number) ?? 0;
  if (currentState[POPSTATE_COUNTER_KEY] === undefined) {
    window.history.replaceState(
      { ...currentState, [POPSTATE_COUNTER_KEY]: initialCounter },
      '',
    );
  }

  let lastCounter = initialCounter;

  window.addEventListener('popstate', (event) => {
    const state = event.state ?? {};
    const newCounter = (state[POPSTATE_COUNTER_KEY] as number) ?? 0;

    runInInjectionContext(injector, () => {
      const service = inject(CORRELATION_ID_SERVICE);
      if (service) {
        const prefix = newCounter > lastCounter ? 'nav-forward' : 'nav-back';
        service.generateAndSet(prefix);
      }
    });

    lastCounter = newCounter;
  });
}

// FnWrapper that captures lastCorrelationId at generator invocation time
const correlationIdFnWrapper: FnWrapper = function* (factory, thisArg, args) {
  const service = (yield {
    [SERVICE_YIELD_REQUEST_MARKER]: true,
    scope: 'function' as const,
    resolve: (injector: Injector) => injector.get(CORRELATION_ID_SERVICE, null),
  }) as ReturnType<typeof createCorrelationIdService> | null;

  const startCorrelationId = service?.lastCorrelationId() ?? null;
  const previousStartId = getCurrentStartCorrelationId();
  setCurrentStartCorrelationId(startCorrelationId);

  try {
    return yield* (
      factory as (...a: unknown[]) => Generator<unknown, unknown, unknown>
    ).apply(thisArg as object, args);
  } finally {
    setCurrentStartCorrelationId(previousStartId);
  }
};

export function provideCorrelationIdTracking(): Provider[] {
  return [
    {
      provide: CORRELATION_ID_SERVICE,
      useFactory: () => createCorrelationIdService(),
    },
    {
      provide: EVENT_MANAGER_PLUGINS,
      useClass: CorrelationIdEventManagerPlugin,
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: () => {
        const injector = inject(Injector);
        return () => initPopstateTracking(injector);
      },
      multi: true,
    },
    provideFnWrapper(
      'Warning: dependency injection here is not type-safe and may fail at runtime',
      correlationIdFnWrapper,
    ),
  ];
}

export type GenDeps_CorrelationIdEventManagerPlugin = GetDeps<{
  deps: {};
  provided: {};
  missingProvider: {
    Injector: Injector;
  };
}>;
