import {
  CraftGenShortCircuit,
  driveCraftProgramAsync,
  isCraftException,
  isCraftGenShortCircuit,
  isGenerator,
  pumpCraftProgramSync,
  ɵInjector as Injector,
  ɵrunInInjectionContext as runInInjectionContext,
  type AnyCraftException,
  type CraftProgramPumpOptions,
  type CraftProgramStep,
  type Unsubscribable,
} from '@craft-ts/core';
import type { StreamContext } from '../craft-stream';

/** What a handler (a plain function or a craft generator) settled to. */
export type HandlerOutcome =
  | { readonly kind: 'value'; readonly value: unknown }
  | { readonly kind: 'exception'; readonly exception: AnyCraftException }
  | { readonly kind: 'error'; readonly error: unknown };

const NO_INJECTOR_MESSAGE =
  'This stream handler yields a service but the stream runs without an injector. Create or subscribe to the stream inside an injection context, or pass { injector }.';

const HANDLER_PUMP_OPTIONS: CraftProgramPumpOptions = {
  invalidYieldErrorMessage:
    'A stream handler yielded something the craft runtime cannot resolve.',
  appStartNotSupportedErrorMessage:
    'onAppStart(...) cannot be yielded from a stream handler.',
};

/** Stand-in injector for injector-less contexts: any lookup fails loudly. */
const NO_INJECTOR = {
  get(_token: unknown, ...rest: unknown[]) {
    if (rest.length > 0 && rest[0] !== undefined) return rest[0];
    throw new Error(NO_INJECTOR_MESSAGE);
  },
} as unknown as Injector;

function stepToOutcome(
  step: Exclude<CraftProgramStep, { kind: 'await' }>,
): HandlerOutcome {
  if (step.kind === 'shortCircuit') {
    return { kind: 'exception', exception: step.exception };
  }
  return valueOutcome(step.value);
}

function valueOutcome(value: unknown): HandlerOutcome {
  // A handler that resolves to a craftException re-enters the exception
  // channel (mirrors craftGen's own return contract).
  return isCraftException(value)
    ? { kind: 'exception', exception: value }
    : { kind: 'value', value };
}

function failureOutcome(error: unknown): HandlerOutcome {
  return isCraftGenShortCircuit(error)
    ? { kind: 'exception', exception: error.exception }
    : { kind: 'error', error };
}

/**
 * Runs a handler: `invoke` returns a value or a craft generator. A generator is
 * pumped synchronously and only goes async across real suspensions (a
 * `craftSleep`, a promise), so a synchronous handler settles in the same tick.
 * `settle` is called exactly once unless the returned handle is unsubscribed
 * first, in which case it is never called.
 */
export function runHandler(
  context: StreamContext,
  invoke: () => unknown,
  settle: (outcome: HandlerOutcome) => void,
): Unsubscribable {
  let cancelled = false;
  const controller = new AbortController();
  const handle: Unsubscribable = {
    unsubscribe() {
      if (cancelled) return;
      cancelled = true;
      controller.abort();
    },
  };
  const deliver = (outcome: HandlerOutcome) => {
    if (!cancelled) settle(outcome);
  };

  const injector = context.injector ?? NO_INJECTOR;
  const options: CraftProgramPumpOptions = {
    ...HANDLER_PUMP_OPTIONS,
    abortSignal: controller.signal,
  };
  const inContext = <T>(fn: () => T): T =>
    context.injector ? runInInjectionContext(context.injector, fn) : fn();

  try {
    const result = inContext(invoke);

    if (!isGenerator(result)) {
      deliver(valueOutcome(result));
      return handle;
    }

    const first = inContext(() =>
      pumpCraftProgramSync(result, injector, options),
    );

    if (first.kind !== 'await') {
      deliver(stepToOutcome(first));
      return handle;
    }

    driveCraftProgramAsync(result, injector, first, options).then(
      (settled) => deliver(stepToOutcome(settled)),
      (error) => deliver(failureOutcome(error)),
    );
  } catch (error) {
    deliver(failureOutcome(error));
  }

  return handle;
}

/** Re-throws an exception outcome as the short-circuit a craft program expects. */
export function throwIfException(outcome: HandlerOutcome): void {
  if (outcome.kind === 'exception') {
    throw new CraftGenShortCircuit(outcome.exception);
  }
}
