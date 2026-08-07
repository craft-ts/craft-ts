import {
  inject,
  Injector,
  provideAppInitializer,
  runInInjectionContext,
  type EnvironmentProviders,
  type Provider,
} from '@angular/core';
import {
  CORRELATION_ID_SERVICE,
  createCorrelationIdService,
  getCurrentStartCorrelationId,
  setCurrentStartCorrelationId,
} from './correlation-id';
import {
  provideCraftDomEventHook,
  type CraftDomEventHook,
} from './dom-event-hook';
import { SERVICE_YIELD_REQUEST_MARKER } from './craft-generator-runtime';
import { provideFnWrapper, type FnWrapper } from './fn-wrapper';

const correlationIdDomEventHook: CraftDomEventHook = (interaction, next) => {
  const service = inject(CORRELATION_ID_SERVICE);
  service?.generateAndSet(interaction.interactionName);
  return next();
};

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

export function provideCorrelationIdTracking(): (
  | Provider
  | EnvironmentProviders
)[] {
  return [
    {
      provide: CORRELATION_ID_SERVICE,
      useFactory: () => createCorrelationIdService(),
    },
    provideCraftDomEventHook(correlationIdDomEventHook),
    provideAppInitializer(() => {
      initPopstateTracking(inject(Injector));
    }),
    provideFnWrapper(
      'Warning: dependency injection here is not type-safe and may fail at runtime',
      correlationIdFnWrapper,
    ),
  ];
}
