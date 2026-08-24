import type { Effect } from 'effect';

// ---------------------------------------------------------------------------
// Task 2.5 — checking `R` at the yield site.
//
// Why it has to be here and not in the bridge. `Effect.isEffect` narrows to an
// Effect with UNKNOWN requirements, and running one demands `R = never`. By the
// time the bridge holds the value, the only thing left to do is cast: the
// information needed to blame the offending line is gone, and an unmet
// requirement becomes a runtime surprise. That was finding 0.1-a.
//
// `assertNoRequirements` moves the check to the call site, where the compiler
// can still point at the yield.
// ---------------------------------------------------------------------------

declare const REQUIREMENT_BRAND: unique symbol;

/**
 * The error surfaced when a yielded Effect still needs services the level does
 * not provide. It is a branded object rather than `never` so the message
 * survives into the diagnostic instead of collapsing.
 */
export type MissingRequirements<R> = {
  readonly [REQUIREMENT_BRAND]: 'This Effect still requires services that no provideLayer() supplies';
  readonly missing: R;
};

/**
 * `Effect<A, E, never>` passes through unchanged; anything with leftover
 * requirements resolves to {@link MissingRequirements}, which is not assignable
 * to an Effect and therefore errors AT THE YIELD.
 */
export type AssertNoRequirements<Self> =
  Self extends Effect.Effect<infer _A, infer _E, infer R>
    ? [R] extends [never]
      ? Self
      : MissingRequirements<R>
    : Self;

/**
 * Guards a yield site: `yield* assertNoRequirements(someEffect)` fails to
 * compile when `someEffect` still carries requirements, naming them.
 *
 * @example
 * // ok — every requirement is provided by a provideLayer() up the chain
 * const user = yield* assertNoRequirements(loadUser(id));
 */
export function assertNoRequirements<A, E>(
  effect: Effect.Effect<A, E, never>,
): Effect.Effect<A, E, never> {
  return effect;
}
