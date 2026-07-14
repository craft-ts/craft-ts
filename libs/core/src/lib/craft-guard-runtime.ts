import { computed, Injector, runInInjectionContext } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import type { Router, UrlTree } from '@angular/router';
import { filter, take } from 'rxjs';
import { isCraftException, type AnyCraftException } from './craft-exception';
import { isCraftGenShortCircuit } from './craft-gen';
import {
  craftExceptionOutcomeApi,
  type CraftExceptionComponentInput,
  type CraftExceptionHandlerContext,
  type CraftExceptionOutcome,
  type CraftRoutePhase,
} from './craft-route-exceptions';
import {
  isGenerator,
  isGuardAwaitRequest,
  resolveCraftGeneratorYield,
  type GuardAwaitResourceLike,
  type RuntimeGuardAwaitRequest,
} from './craft-generator-runtime';

const GUARD_INVALID_YIELD_ERROR_MESSAGE =
  'craft route guards can only yield craftService dependencies, exposed dependency helpers, or an untilSettled/untilDefined await request.';

type GuardPumpResult =
  | { kind: 'done'; value: unknown }
  | { kind: 'await'; request: RuntimeGuardAwaitRequest }
  | { kind: 'shortCircuit'; exception: AnyCraftException };

type GuardSettledStep = Exclude<GuardPumpResult, { kind: 'await' }>;

// Pumps `iterator` synchronously, resolving craft service yields, until it
// completes, throws a `CraftGenShortCircuit` (caught and surfaced as the carried
// exception), or yields a guard await-request — at which point the iterator is
// left positioned right after the await so the caller can resume it once the
// awaited value is available. `resumeValue` feeds the first `next(...)` (used to
// resume after an await; ignored on the initial pump).
function pumpGuardSync(
  iterator: Generator<unknown, unknown, unknown>,
  injector: Injector,
  resumeValue?: unknown,
): GuardPumpResult {
  try {
    let current = iterator.next(resumeValue as never);

    while (!current.done) {
      const yielded = current.value;

      if (isGuardAwaitRequest(yielded)) {
        return { kind: 'await', request: yielded };
      }

      const resolution = resolveCraftGeneratorYield(
        yielded,
        injector,
        'function',
      );

      if (!resolution.handled) {
        throw new Error(GUARD_INVALID_YIELD_ERROR_MESSAGE);
      }

      current = iterator.next(resolution.value as never);
    }

    return { kind: 'done', value: current.value };
  } catch (error) {
    if (isCraftGenShortCircuit(error)) {
      return { kind: 'shortCircuit', exception: error.exception };
    }

    throw error;
  }
}

function isResourceSettled(resource: GuardAwaitResourceLike): boolean {
  const status = resource.status();

  return status === 'resolved' || status === 'exception';
}

// Bridges a single guard await-request to a Promise: `'promise'` requests await
// the thenable directly; `'settle'` requests subscribe to the resource's settled
// status (computed off its signals, observed on `injector`) and resolve on the
// first settle.
function awaitGuardRequest(
  request: RuntimeGuardAwaitRequest,
  injector: Injector,
): Promise<unknown> {
  if (request.kind === 'promise') {
    return Promise.resolve(request.value);
  }

  return new Promise<unknown>((resolve, reject) => {
    try {
      const settled$ = runInInjectionContext(injector, () =>
        toObservable(
          computed(() => isResourceSettled(request.resource)),
          {
            injector,
          },
        ),
      ).pipe(
        filter((settled) => settled),
        take(1),
      );

      settled$.subscribe({
        next: () => resolve(undefined),
        error: reject,
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Resumes `iterator` across every await it hits until it settles (completes or
// short-circuits). Each post-await segment runs inside the injection context —
// ambient context is gone after an `await`, so service resolution and the next
// `toObservable({ injector })` need it restored.
async function driveGuardStageAsync(
  iterator: Generator<unknown, unknown, unknown>,
  injector: Injector,
  step: GuardPumpResult,
): Promise<GuardSettledStep> {
  let current = step;

  while (current.kind === 'await') {
    const value = await awaitGuardRequest(current.request, injector);
    current = runInInjectionContext(injector, () =>
      pumpGuardSync(iterator, injector, value),
    );
  }

  return current;
}

/**
 * The result of a synchronous guard re-evaluation (reactive "live" guards):
 * - `valid` — the guard passed without producing an exception;
 * - `exception` — the guard short-circuited / returned a `craftException`;
 * - `pending` — the guard suspended on a not-yet-settled `untilSettled` (cannot be
 *   resolved synchronously) — the reactive check treats this as "still valid".
 */
export type CraftGuardSyncResult =
  | { kind: 'valid'; value: unknown }
  | { kind: 'exception'; exception: AnyCraftException }
  | { kind: 'pending' };

/**
 * Evaluates a guard generator **synchronously** for the reactive `phase: 'active'`
 * re-check. Pumping the generator reads the craft signals it yields synchronously,
 * so an enclosing `effect` tracks them; a settled `untilSettled` resolves on the
 * fast path, while a not-yet-settled await yields `'pending'` (no suspension).
 */
export function evaluateCraftGuardSync(
  iterator: Generator<unknown, unknown, unknown>,
  injector: Injector,
): CraftGuardSyncResult {
  const step = runInInjectionContext(injector, () =>
    pumpGuardSync(iterator, injector),
  );

  if (step.kind === 'await') {
    return { kind: 'pending' };
  }

  if (step.kind === 'shortCircuit') {
    return { kind: 'exception', exception: step.exception };
  }

  return isCraftException(step.value)
    ? { kind: 'exception', exception: step.value }
    : { kind: 'valid', value: step.value };
}

// ---------------------------------------------------------------------------
// Non-blocking route chain driver.
//
// Drives a route's `canActivate` → `resolve` chain *after* the URL has committed
// (the `CraftRouterOutlet` calls this), routing any `craftException` through the
// route's exhaustive `handleExceptions` map to a {@link RouteChainOutcome}.
// It never returns a `GuardResult`/`Observable` — the outlet owns rendering, and
// mounts the target only on `'data'`/`'noop'`.
// ---------------------------------------------------------------------------

/** The settled result of a route's guard/resolve chain, consumed by the outlet. */
export type RouteChainOutcome =
  | { kind: 'data'; guardData: unknown; resolveData: unknown }
  | { kind: 'redirect'; target: UrlTree | string }
  | {
      kind: 'render';
      component: CraftExceptionComponentInput;
      exception: AnyCraftException;
    }
  | { kind: 'global'; exception: AnyCraftException }
  | { kind: 'stay' }
  | { kind: 'noop' }
  | { kind: 'thrownError'; error: unknown };

export type CraftRouteExceptionHandler = (
  context: CraftExceptionHandlerContext<AnyCraftException>,
) => Generator<unknown, CraftExceptionOutcome, unknown>;

/** Runtime view of a route's `handleExceptions`, keyed by exception code. */
export type CraftRouteExceptionHandlerMap = Record<
  string,
  CraftRouteExceptionHandler | undefined
>;

export interface CraftRouteChainSteps {
  /** `canMatch` generator — run first; its success value is discarded. */
  match?: Generator<unknown, unknown, unknown>;
  /** `canActivate` generator — its success value is the route's guarded data. */
  guard?: Generator<unknown, unknown, unknown>;
  /** `resolve` generator — its success value is the route's resolved data. */
  resolve?: Generator<unknown, unknown, unknown>;
}

function mapOutcome(
  outcome: CraftExceptionOutcome,
  exception: AnyCraftException,
): RouteChainOutcome {
  switch (outcome.kind) {
    case 'redirect':
      return { kind: 'redirect', target: outcome.target };
    case 'render':
      return { kind: 'render', component: outcome.component, exception };
    case 'global':
      return { kind: 'global', exception };
    case 'stay':
      return { kind: 'stay' };
    case 'noop':
      return { kind: 'noop' };
  }
}

// Resolves one exception through `handleExceptions`. A generator handler (it
// `yield*`s craft services before its outcome) is delegated to so its yields
// reach the driver, exactly like a generator guard/resolve stage.
function* resolveRouteException(
  exception: AnyCraftException,
  router: Router,
  handleExceptions: CraftRouteExceptionHandlerMap,
  phase: CraftRoutePhase,
): Generator<unknown, RouteChainOutcome, unknown> {
  const handler = handleExceptions[exception.code];

  if (!handler) {
    // No handler for this code — surface as a thrown error (the outlet defaults
    // unhandled errors to the global error component).
    return { kind: 'thrownError', error: exception };
  }

  const context: CraftExceptionHandlerContext<AnyCraftException> = {
    ...craftExceptionOutcomeApi,
    exception,
    payload: exception.payload,
    phase,
    router,
    createUrlTree: router.createUrlTree.bind(router),
    navigate: router.navigate.bind(router),
    navigateByUrl: router.navigateByUrl.bind(router),
  };

  const result = handler(context);
  if (!isGenerator(result)) {
    throw new Error(
      'Route exception handlers must be wrapped with craftExceptionHandler(function* (...) {}).',
    );
  }
  const outcome = yield* result;

  return mapOutcome(outcome, exception);
}

// Drives any composing generator (guard, resolve, or exception handler) to a
// settled step, going async only across real `untilSettled`/`untilDefined`
// awaits — reusing the same pump/await plumbing as the synchronous re-check.
async function driveStageToSettled(
  iterator: Generator<unknown, unknown, unknown>,
  injector: Injector,
): Promise<GuardSettledStep> {
  const first = runInInjectionContext(injector, () =>
    pumpGuardSync(iterator, injector),
  );

  return driveGuardStageAsync(iterator, injector, first);
}

async function resolveExceptionOutcome(
  exception: AnyCraftException,
  injector: Injector,
  router: Router,
  handleExceptions: CraftRouteExceptionHandlerMap,
  phase: CraftRoutePhase,
): Promise<RouteChainOutcome> {
  const iterator = resolveRouteException(
    exception,
    router,
    handleExceptions,
    phase,
  );
  const first = runInInjectionContext(injector, () =>
    pumpGuardSync(iterator, injector),
  );

  if (first.kind === 'await') {
    throw new Error(
      'Route exception handlers cannot suspend with untilSettled/untilDefined.',
    );
  }

  // A handler that itself short-circuited (rare) cannot be handled again —
  // surface it as a thrown error.
  return first.kind === 'shortCircuit'
    ? { kind: 'thrownError', error: first.exception }
    : (first.value as RouteChainOutcome);
}

// Drives one data stage (guard or resolve): either it yields an outcome to
// short-circuit the whole chain (an exception was handled), or it produces the
// stage's success data.
async function driveDataStage(
  iterator: Generator<unknown, unknown, unknown>,
  injector: Injector,
  router: Router,
  handleExceptions: CraftRouteExceptionHandlerMap,
  phase: CraftRoutePhase,
): Promise<{ outcome: RouteChainOutcome } | { data: unknown }> {
  const settled = await driveStageToSettled(iterator, injector);

  // A stage may signal an exception by throwing (`CraftGenShortCircuit`) or by
  // returning a bare `craftException` — handle both (mirrors the handler path).
  const exception =
    settled.kind === 'shortCircuit'
      ? settled.exception
      : isCraftException(settled.value)
        ? settled.value
        : undefined;

  if (exception) {
    return {
      outcome: await resolveExceptionOutcome(
        exception,
        injector,
        router,
        handleExceptions,
        phase,
      ),
    };
  }

  return { data: settled.kind === 'done' ? settled.value : undefined };
}

/**
 * Drives a route's `canActivate` → `resolve` chain to a {@link RouteChainOutcome}.
 *
 * `phase` is `'enter'` for the initial activation and `'active'` for a reactive
 * guard re-evaluation; it is forwarded to each exception handler so a handler can
 * react differently (e.g. a softer redirect on session expiry).
 */
export async function runCraftRouteChainAsync(
  steps: CraftRouteChainSteps,
  injector: Injector,
  router: Router,
  handleExceptions: CraftRouteExceptionHandlerMap,
  phase: CraftRoutePhase = 'enter',
): Promise<RouteChainOutcome> {
  try {
    if (steps.match) {
      const result = await driveDataStage(
        steps.match,
        injector,
        router,
        handleExceptions,
        phase,
      );

      // `canMatch` only gates: an exception short-circuits the chain; its
      // success value is discarded (no data path).
      if ('outcome' in result) {
        return result.outcome;
      }
    }

    let guardData: unknown;

    if (steps.guard) {
      const result = await driveDataStage(
        steps.guard,
        injector,
        router,
        handleExceptions,
        phase,
      );

      if ('outcome' in result) {
        return result.outcome;
      }

      guardData = result.data;
    }

    let resolveData: unknown;

    if (steps.resolve) {
      const result = await driveDataStage(
        steps.resolve,
        injector,
        router,
        handleExceptions,
        phase,
      );

      if ('outcome' in result) {
        return result.outcome;
      }

      resolveData = result.data;
    }

    return { kind: 'data', guardData, resolveData };
  } catch (error) {
    // A rethrown `craftException` (e.g. the generic `HttpError`) routes through
    // `handleExceptions` when a matching handler exists; anything else (a real
    // error, or an unhandled code) becomes a thrown error → global by default.
    if (isCraftException(error) && handleExceptions[error.code]) {
      try {
        return await resolveExceptionOutcome(
          error,
          injector,
          router,
          handleExceptions,
          phase,
        );
      } catch (handlerError) {
        return { kind: 'thrownError', error: handlerError };
      }
    }

    return { kind: 'thrownError', error };
  }
}
