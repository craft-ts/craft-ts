import {
  craftException,
  setForeignYieldBridge,
  type ForeignYieldContext,
  type ForeignYieldOutcome,
} from '@craft-ts/core';
import { Cause, Effect, Exit, Option } from 'effect';
import { resolveEffectLevel } from './effect-level';
import type { CraftEffectGen } from './effect-exceptions';

// ---------------------------------------------------------------------------
// Tasks 2.3 to 2.6 — running a yielded Effect on the craft pump.
//
// Channel mapping (task 2.4), and none of the three is interchangeable:
//
//   success            -> the generator resumes with the value
//   typed failure `E`  -> a craft exception, tagged with the error's `_tag`;
//                         this is the only thing `handleExceptions` may see
//   defect (`die`)     -> rethrown onto the ERROR channel; a defect is a bug,
//                         not a business outcome, and must never be catchable
//                         as an exception
//   interruption       -> `CraftEffectInterrupted`, also never an exception:
//                         the program was cancelled, nothing "went wrong"
// ---------------------------------------------------------------------------

/**
 * Thrown when a yielded Effect is interrupted because its owning program was
 * superseded or destroyed. Deliberately NOT a craft exception: cancellation is
 * not a business outcome, and letting it reach `handleExceptions` would make
 * every route handler responsible for a case it cannot act on.
 */
export class CraftEffectInterrupted extends Error {
  constructor() {
    super('The yielded Effect was interrupted because its program was cancelled.');
    this.name = 'CraftEffectInterrupted';
  }
}

/**
 * Runs one Effect against the level in force for `context.injector`, and maps
 * its exit onto craft's channels.
 */
export function runYieldedEffect(
  effect: Effect.Effect<unknown, unknown, unknown>,
  context: ForeignYieldContext,
): PromiseLike<ForeignYieldOutcome> {
  const level = resolveEffectLevel(context.injector);

  // Task 2.5, runtime half: satisfy `R` from the level's context. The
  // type-level half — rejecting a yield whose requirements the level cannot
  // meet — is enforced at the yield site by `AssertNoRequirements`, since by
  // the time we are here the information needed to blame the right code is
  // already gone.
  const run = level
    ? Effect.runPromiseExitWith(level.context)
    : Effect.runPromiseExit;

  return run(effect as Effect.Effect<unknown, unknown, never>, {
    signal: context.abortSignal,
  }).then((exit): ForeignYieldOutcome => {
    if (Exit.isSuccess(exit)) {
      return { kind: 'value', value: exit.value };
    }

    const cause = exit.cause;

    // Interruption first: an interrupted fiber has no typed error to report,
    // and must not be mistaken for a defect either.
    if (Cause.hasInterrupts(cause) && !Cause.hasFails(cause)) {
      throw new CraftEffectInterrupted();
    }

    const failure = Cause.findErrorOption(cause);
    if (Option.isNone(failure)) {
      // Defect: rethrowing rejects the await, which surfaces on the resource's
      // error channel rather than its exception channel.
      throw Cause.squash(cause);
    }

    const error = failure.value;
    return {
      kind: 'exception',
      // Identity since wave 1: Effect's `_tag` IS craft's discriminant.
      exception: craftException(
        { _tag: effectErrorTag(error), scope: 'loader' },
        error,
      ),
    };
  });
}

/**
 * Registers the bridge that lets `yield* someEffect` work inside any craft
 * program — task 2.3. Call once at bootstrap; returns a disposer.
 *
 * Effect v4 yields the Effect itself, so detection is structural. In v3 the
 * yielded value was a `YieldWrap` hiding the Effect in a `#private` field,
 * which forced a dependency on `effect/Utils`; that is gone.
 */
export function installCraftEffectBridge(): () => void {
  return setForeignYieldBridge((yielded, context) => {
    if (!Effect.isEffect(yielded)) {
      return undefined;
    }
    return runYieldedEffect(
      yielded as Effect.Effect<unknown, unknown, unknown>,
      context,
    );
  });
}

/**
 * The stable spelling of `yield* effect` — task 2.3 — and the thing that makes
 * an Effect's error channel visible to craft's type system at all.
 *
 * A bare `yield* someEffect` works at runtime but declares NOTHING: craft reads
 * a generator's YIELDED type looking for exception markers, and an `Effect`
 * carries none. `runEffect` yields the Effect unchanged while advertising, in
 * its Yielded type only, the craft exceptions `E` maps to — so route
 * exhaustiveness and `queryRef.exception()` finally see them. That was finding
 * 0.1-b, and this is where it is closed.
 *
 * @example
 * // handleExceptions is now checked against UserNotFound | Unauthorized
 * canActivate: craftGen(function* () {
 *   yield* runEffect(loadUser(id));
 *   return true;
 * })
 */
export function runEffect<A, E>(
  effect: Effect.Effect<A, E, never>,
): CraftEffectGen<A, E> {
  return (function* () {
    // The bridge recognises the Effect and feeds back its success value.
    return (yield effect) as A;
  })() as CraftEffectGen<A, E>;
}

function effectErrorTag(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    '_tag' in error &&
    typeof (error as { _tag?: unknown })._tag === 'string'
  ) {
    return (error as { _tag: string })._tag;
  }
  return 'EffectFailure';
}
