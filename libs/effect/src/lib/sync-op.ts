import {
  craftException,
  CraftGenShortCircuit,
  setForeignSyncYieldBridge,
  type ForeignSyncYieldContext,
  ɵInjector as Injector,
} from '@craft-ts/core';
import { Cause, Effect, Exit, Option } from 'effect';
import { resolveEffectLevel } from './effect-level';
import type { CraftSyncEffectGen } from './effect-exceptions';

// ---------------------------------------------------------------------------
// Declaring an Effect synchronous.
//
// THE PROBLEM. `Effect<A, E, R>` says nothing about whether running it will
// suspend, and it cannot: the same three channels describe `Effect.succeed(1)`
// and a network call. That is fine inside a loader, where suspending is the
// point, and fatal in a `params`, a `craftComputed` or a `craftMethod`, which
// the synchronous driver runs to completion on one tick.
//
// Craft's answer, until now, was a blanket ban: no Effect at all in those
// positions. That is safe and useless — a pure business calculation living in
// an Effect service could not be reused in a computation.
//
// THE WAY OUT. The information does not exist in the type, so it has to be
// WRITTEN there, in the one channel Effect accumulates across composition: `R`.
// An Effect that requires {@link SyncOp} is one whose author declares it never
// suspends. Requirements union through `Effect.gen`, so the declaration
// propagates to every caller for free, and — crucially — WITHOUT wrapping the
// member, which would freeze its generics (see the note atop effect-service.ts).
//
// It is a claim, not a proof, and it is checked on both other sides:
//   - the `craft-ts/sync-effect-body` lint rule reads the body, all branches
//     included, and rejects a declared-sync body that yields something async;
//   - {@link syncEffect} runs through `runSyncExitWith`, which cannot suspend:
//     a broken promise fails loudly, immediately, at the first call — never as
//     a frozen UI.
// ---------------------------------------------------------------------------

declare const SYNC_OP: unique symbol;

/**
 * The phantom requirement carried by an Effect its author declares synchronous.
 *
 * It is never provided and never resolved: {@link SyncOp}'s runtime value is
 * `Effect.void`, so `yield* SyncOp` costs nothing and only exists to put this
 * type into `R`.
 */
export interface SyncOp {
  readonly [SYNC_OP]: 'declared synchronous';
}

/**
 * Declares the enclosing Effect synchronous by adding {@link SyncOp} to its
 * requirements.
 *
 * Needed only where `R` is INFERRED — a standalone `Effect.gen` that calls
 * nothing already declared. When the shape of a service member is written by
 * hand, spell the requirement in the shape instead and skip this: `Effect<A, E,
 * never>` is assignable to `Effect<A, E, SyncOp>`, so the implementation needs
 * no ceremony.
 *
 * @example
 * export function cartWeight(lines: readonly CartLine[]) {
 *   return Effect.gen(function* () {
 *     yield* SyncOp;
 *     return lines.reduce((total, line) => total + line.qty * 250, 0);
 *   });
 * }
 */
export const SyncOp = Effect.void as unknown as Effect.Effect<
  void,
  never,
  SyncOp
>;

declare const SYNC_DECLARATION_BRAND: unique symbol;

/**
 * The error surfaced when {@link syncEffect} is handed an Effect nobody declared
 * synchronous. A branded object rather than `never` so the message survives into
 * the diagnostic instead of collapsing.
 */
export type NotDeclaredSynchronous<R> = {
  readonly [SYNC_DECLARATION_BRAND]: 'This Effect is not declared synchronous: add SyncOp to its requirements, or run it from a loader';
  readonly requirements: R;
};

/**
 * `unknown` (an inert intersection member) when `R` carries {@link SyncOp},
 * {@link NotDeclaredSynchronous} otherwise — which is not assignable to an
 * Effect and therefore errors AT THE CALL, naming what is missing.
 */
export type AssertDeclaredSync<R> = [SyncOp] extends [R]
  ? unknown
  : NotDeclaredSynchronous<R>;

const SYNC_EFFECT_REQUEST = Symbol.for('@craft-ts/effect/sync-effect-request');

type SyncEffectRequest = {
  readonly [SYNC_EFFECT_REQUEST]: true;
  readonly effect: Effect.Effect<unknown, unknown, unknown>;
  readonly label?: string;
};

function isSyncEffectRequest(value: unknown): value is SyncEffectRequest {
  return (
    typeof value === 'object' && value !== null && SYNC_EFFECT_REQUEST in value
  );
}

/**
 * Thrown when an Effect declared synchronous suspends anyway. Deliberately NOT
 * a craft exception: a broken declaration is a bug, not a business outcome, and
 * must never be catchable through `handleExceptions`.
 */
export class CraftEffectNotSynchronous extends Error {
  constructor(label?: string) {
    super(
      `${
        label ? `"${label}"` : 'This Effect'
      } is declared synchronous (SyncOp) but suspended. Move the asynchronous work to a loader (queryEffect / mutationEffect / asyncProcessEffect).`,
    );
    this.name = 'CraftEffectNotSynchronous';
  }
}

/**
 * Runs an Effect declared synchronous, in place, inside any craft generator —
 * including the ones the synchronous driver owns (`params`, `craftComputed`,
 * `craftMethod`), where a plain `yield* someEffect` cannot go.
 *
 * The Effect's requirements are satisfied by the level in force for the host's
 * injector, exactly like a loader's; the only thing checked at the type level
 * is that {@link SyncOp} is among them.
 *
 * Its typed failures reach craft's exception channel like `runEffect`'s do,
 * so `handleExceptions` and `queryRef.exception()` see them.
 *
 * @example
 * const totalLabel = craftComputed('totalLabel', function* () {
 *   const cents = yield* syncEffect(cartTotal(yield* cart(), null));
 *   return yield* syncEffect(formatPrice(cents));
 * });
 */
export function syncEffect<A, E, R>(
  effect: Effect.Effect<A, E, R> & AssertDeclaredSync<R>,
  options: Readonly<{ label?: string }> = {},
): CraftSyncEffectGen<A, E> {
  return (function* () {
    const request: SyncEffectRequest = {
      [SYNC_EFFECT_REQUEST]: true,
      effect: effect as Effect.Effect<unknown, unknown, unknown>,
      ...(options.label === undefined ? {} : { label: options.label }),
    };

    return (yield request) as A;
  })() as CraftSyncEffectGen<A, E>;
}

/**
 * Runs one declared-synchronous Effect against the level in force for
 * `injector`, and maps its exit onto craft's channels — the same mapping as
 * `runYieldedEffect`, minus the interruption case, which cannot arise here.
 */
function runSyncEffectRequest(
  request: SyncEffectRequest,
  injector: Injector,
): unknown {
  const level = resolveEffectLevel(injector);
  const run = level
    ? Effect.runSyncExitWith(level.context)
    : Effect.runSyncExit;

  const exit = run(request.effect as Effect.Effect<unknown, unknown, never>);

  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  const cause = exit.cause;
  const failure = Cause.findErrorOption(cause);

  if (Option.isNone(failure)) {
    const defect = Cause.squash(cause);

    // The declaration was wrong: `runSyncExitWith` could not settle the fiber,
    // and left it running. Interrupt it before reporting, so a broken promise
    // does not also leak a background computation.
    if (Cause.isAsyncFiberError(defect)) {
      defect.fiber.interruptUnsafe();
      throw new CraftEffectNotSynchronous(request.label);
    }

    throw defect;
  }

  const error = failure.value;
  throw new CraftGenShortCircuit(
    craftException({ _tag: effectErrorTag(error), scope: 'loader' }, error),
  );
}

/**
 * Registers the bridge that resolves {@link syncEffect} yields on the spot.
 * Installed by `installCraftEffectBridge`; exported for tests that want the
 * synchronous half alone. Returns a disposer.
 */
export function installCraftSyncEffectBridge(): () => void {
  return setForeignSyncYieldBridge(
    (yielded: unknown, context: ForeignSyncYieldContext) => {
      if (!isSyncEffectRequest(yielded)) {
        return undefined;
      }

      return {
        handled: true,
        value: runSyncEffectRequest(yielded, context.injector),
      };
    },
  );
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
