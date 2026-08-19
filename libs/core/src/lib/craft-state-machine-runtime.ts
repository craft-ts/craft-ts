import {
  DestroyRef,
  effect,
  inject,
  Injector,
  runInInjectionContext,
  untracked,
  type Signal,
} from './host/craft-compat';
import {
  isGenerator,
  runCraftGenerator,
  SERVICE_TRACKED_DEPS_REQUEST_MARKER,
} from './craft-generator-runtime';
import type { CraftWritableSignal } from './host/craft-signal';
import {
  isYieldableReactiveValue,
  rawReactiveValue,
  type YieldableReactiveValue,
} from './reactive-read';

/**
 * Runtime core of `craftStateMachine`, kept in its own module so `on$` and
 * `afterRecomputation` can register machine callbacks without importing the
 * public state-machine surface (which imports them back for its own typing).
 */

const MACHINE_INVALID_YIELD_ERROR_MESSAGE =
  'craftStateMachine generators can only yield craftService dependencies or exposed dependency helpers.';
const MACHINE_APP_START_ERROR_MESSAGE =
  'craftStateMachine generators do not support onAppStart(...).';

/** A guard as the machine stores it: any transition in, truthiness out. */
export type RuntimeTransitionGuard = (transition: {
  readonly from: string | undefined;
  readonly to: string;
  readonly context: unknown;
  readonly event: unknown;
}) => unknown;

export type MachineRuntime = {
  readonly context: unknown;
  readonly currentStep: CraftWritableSignal<string | undefined>;
  readonly globalGuards: readonly RuntimeTransitionGuard[];
  readonly stepGuards: Map<string, readonly RuntimeTransitionGuard[]>;
  readonly injector: Injector;
  readonly initRegistrations: Array<() => void>;
};

/**
 * The step currently being installed (or the step a registered callback was
 * declared under). `transit(...)` reads it to know its target, which is why the
 * registration helpers restore it around every deferred callback.
 */
export type MachineScope = {
  readonly runtime: MachineRuntime;
  readonly target: string;
};

let activeScope: MachineScope | undefined;

export function ɵactiveMachineScope(): MachineScope | undefined {
  return activeScope;
}

export function ɵrequireMachineScope(helper: string): MachineScope {
  if (!activeScope) {
    throw new Error(
      `${helper} can only be used inside a transitionStep(...) of a craftStateMachine.`,
    );
  }
  return activeScope;
}

export function ɵwithMachineScope<Result>(
  scope: MachineScope,
  run: () => Result,
): Result {
  const previous = activeScope;
  activeScope = scope;
  try {
    return run();
  } finally {
    activeScope = previous;
  }
}

/**
 * Drives a generator produced inside a machine (a step installation, a
 * registered callback, one of the machine factories) through the synchronous
 * craft runtime, so `yield* SomeService()` resolves against the machine's
 * injector.
 */
export function ɵdriveMachineGenerator(
  value: unknown,
  injector: Injector,
): unknown {
  if (!isGenerator(value)) {
    return value;
  }

  return runCraftGenerator({
    iterator: value,
    injector,
    hostScope: 'function',
    invalidYieldErrorMessage: MACHINE_INVALID_YIELD_ERROR_MESSAGE,
    multipleAppStartErrorMessage: MACHINE_APP_START_ERROR_MESSAGE,
    onAppStartNotSupportedErrorMessage: MACHINE_APP_START_ERROR_MESSAGE,
  }).value;
}

/**
 * Runs a deferred machine callback: the declaring step is restored so
 * `transit(...)` resolves to the right target, reads stay untracked (a callback
 * driven from an effect must not subscribe the effect to whatever its guards
 * read), and the returned generator — typically `transit(event).pipe(...)` — is
 * driven through the craft runtime.
 */
export function ɵrunMachineCallback(
  scope: MachineScope,
  run: () => unknown,
): unknown {
  return untracked(() =>
    ɵwithMachineScope(scope, () =>
      runInInjectionContext(scope.runtime.injector, () =>
        ɵdriveMachineGenerator(run(), scope.runtime.injector),
      ),
    ),
  );
}

/**
 * The value `yield* on$(...)` / `yield* afterRecomputation(...)` /
 * `yield* initStateMachine(...)` resolve to. It yields one tracked-deps request
 * (a no-op the craft runtime already understands) so the registration is a
 * regular member of the step generator's yield chain.
 */
export function ɵmachineRegistration(): Generator<unknown, void, unknown> {
  return (function* () {
    yield {
      [SERVICE_TRACKED_DEPS_REQUEST_MARKER]: true,
      providedIn: 'global',
      resolve: () => undefined,
    };
  })();
}

/** Registration behind `on$(source, callback)` inside a transitionStep. */
export function ɵregisterMachineSource(
  source: {
    subscribe: (callback: (value: never) => void) => { unsubscribe(): void };
  },
  callback: (value: never) => unknown,
): Generator<unknown, void, unknown> {
  const scope = ɵrequireMachineScope('on$(...)');
  const subscription = source.subscribe((value) => {
    ɵrunMachineCallback(scope, () => callback(value));
  });
  inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  return ɵmachineRegistration();
}

/** Registration behind `afterRecomputation(signal, callback)` inside a step. */
export function ɵregisterMachineRecomputation(
  source: Signal<unknown>,
  callback: (value: never) => unknown,
): Generator<unknown, void, unknown> {
  const scope = ɵrequireMachineScope('afterRecomputation(...)');
  // A craft reactive value is itself the generator-shaped reader; reading it as
  // a plain signal means going through its raw source.
  const read = isYieldableReactiveValue(source)
    ? (rawReactiveValue(source as YieldableReactiveValue<unknown>) as Signal<unknown>)
    : source;

  effect(() => {
    const value = read();
    ɵrunMachineCallback(scope, () => callback(value as never));
  });
  return ɵmachineRegistration();
}

/** Registration behind `initStateMachine(callback)` inside a step. */
export function ɵregisterMachineInit(
  callback: () => unknown,
): Generator<unknown, void, unknown> {
  const scope = ɵrequireMachineScope('initStateMachine(...)');
  scope.runtime.initRegistrations.push(() => {
    ɵrunMachineCallback(scope, callback);
  });
  return ɵmachineRegistration();
}

/**
 * Evaluates a transition attempt: global guards, then the target step's guards,
 * then the guards attached to this very `transit(...)` call. A transition to the
 * current step is a no-op, and the accepted attempt simply publishes the new
 * step — the last accepted `transit()` wins, with no queue and no priority.
 */
export function ɵrunTransition(
  scope: MachineScope,
  event: unknown,
  localGuards: readonly RuntimeTransitionGuard[],
): Generator<unknown, boolean, unknown> {
  return (function* () {
    const { runtime, target } = scope;
    const from = untracked(() => runtime.currentStep());

    if (from === target) {
      return false;
    }

    const transition = {
      from,
      to: target,
      context: runtime.context,
      event,
    };

    const guards = [
      ...runtime.globalGuards,
      ...(runtime.stepGuards.get(target) ?? []),
      ...localGuards,
    ];

    for (const guard of guards) {
      const result = guard(transition);
      const resolved = isGenerator(result)
        ? yield* (result as Generator<unknown, unknown, unknown>)
        : result;

      if (!resolved) {
        return false;
      }
    }

    runtime.currentStep.set(target);
    return true;
  })();
}
