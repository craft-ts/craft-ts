// ---------------------------------------------------------------------------
// ɵ WAVE-0 EFFECT PROTOTYPE — THROWAWAY (plan task 0.1).
//
// Bridges `yield* someEffect` into the craft program pump. This file is a
// `.fixture.ts` on purpose: `libs/core/tsconfig.lib.json` excludes that pattern,
// so the published build of `@craft-ts/core` never resolves `effect`. The only
// production-side change the prototype needs is the foreign-yield hook in
// `craft-program-runtime.ts`.
//
// Protocol, verified against effect@3.22.1:
//   `yield* effect` yields a `YieldWrap` instance (a `#private` field, so it can
//   only be opened with `yieldWrapGet` — no structural sniffing possible), and
//   whatever is fed back through `next(...)` becomes the value of `yield*`.
// ---------------------------------------------------------------------------

import { Cause, Effect, Exit, Option } from 'effect';
import { YieldWrap, yieldWrapGet } from 'effect/Utils';
import { craftException } from './craft-exception';
import {
  ɵsetForeignYieldBridge,
  type ForeignYieldOutcome,
} from './craft-program-runtime';

/**
 * Installs the Effect bridge for the duration of a test; returns the disposer.
 *
 * Channel mapping (plan task 2.4):
 * - success        → resumes the generator with the value;
 * - typed failure `E` → craft exception, tagged with the Effect error's `_tag`;
 * - defect (`die`) → rethrown, so it lands on the *error* channel and can never
 *   be caught by `handleExceptions`.
 */
export function installEffectYieldBridge(): () => void {
  return ɵsetForeignYieldBridge((yielded) => {
    if (!(yielded instanceof YieldWrap)) {
      return undefined;
    }

    const inner = yieldWrapGet(yielded);
    if (!Effect.isEffect(inner)) {
      return undefined;
    }

    // FINDING (0.1-a) — `isEffect` narrows to `Effect<unknown, unknown, unknown>`
    // but `runPromiseExit` demands `R = never`: an Effect that still has
    // requirements cannot be run. The cast is the prototype standing in for the
    // runtime that task 2.1/2.2 must provide, and the reason task 2.5 has to
    // check `R` *at the yield site* — by the time we are here, it is too late.
    const runnable = inner as Effect.Effect<unknown, unknown, never>;

    return Effect.runPromiseExit(runnable).then(
      (exit): ForeignYieldOutcome => {
        if (Exit.isSuccess(exit)) {
          return { kind: 'value', value: exit.value };
        }

        const failure = Cause.failureOption(exit.cause);
        if (Option.isNone(failure)) {
          // Defect or interruption: not a business exception. Throwing here
          // rejects the await, which surfaces on the resource's error channel.
          throw Cause.squash(exit.cause);
        }

        const error = failure.value;
        return {
          kind: 'exception',
          // NOTE: Effect discriminates on `_tag`, craft still discriminates on
          // `code` — this line is the whole argument for plan task 1.1. Once
          // craft moves to `_tag`, the mapping is the identity.
          exception: craftException(
            { code: effectErrorTag(error), scope: 'loader' },
            error,
          ),
        };
      },
    );
  });
}

function effectErrorTag(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    '_tag' in error &&
    typeof error._tag === 'string'
  ) {
    return error._tag;
  }
  return 'EffectFailure';
}
