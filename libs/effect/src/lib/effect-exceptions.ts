import type {
  CraftExceptionResult,
  CraftGenExceptionMarker,
} from '@craft-ts/core';
import type { Effect } from 'effect';

// ---------------------------------------------------------------------------
// Finding 0.1-b, closed.
//
// The problem. Until now the bridge mapped an Effect's error channel onto craft
// exceptions AT RUNTIME, and the types knew nothing: a loader yielding a failing
// Effect left `queryRef.exception()` typed `undefined`, and a route's
// handleExceptions map was accepted whatever it contained. "Your Effect errors,
// checked at compile time" was simply not true.
//
// Why it could not be fixed in the bridge. `RouteExceptionUnion` reads the
// YIELDED type of a craft generator, and looks for `CraftGenExceptionMarker`s
// in it. A bare `yield* someEffect` puts an `Effect` in that position, which
// carries no marker — so nothing propagates, no matter what the bridge does
// later.
//
// The fix is at the yield site, which is the one place that still knows `E`.
// `runEffect(effect)` returns a generator whose Yielded type carries a marker
// built from `E`. Delegating to it with `yield*` merges that Yielded into the
// enclosing generator, so `E` reaches `RouteExceptionUnion` exactly like a
// `craftGen` exception does. At runtime it yields the Effect unchanged and the
// existing bridge handles it: the marker is type-only and never emitted.
// ---------------------------------------------------------------------------

/**
 * The craft exception an Effect error becomes, keyed on its `_tag`.
 *
 * NOTE the asymmetry: Effect discriminates on `_tag`, craft still on `code`, so
 * this type transposes one onto the other. Once wave 1 moves craft to `_tag`
 * the transposition becomes the identity and this line collapses — which is the
 * most concrete argument for that wave.
 */
export type EffectExceptionOf<Error> = Error extends { readonly _tag: infer Tag }
  ? Tag extends string
    ? CraftExceptionResult<{ code: Tag; scope: 'loader' }, Error>
    : never
  : never;

/**
 * The marker union a yielded Effect contributes. `never` when `E` is `never`,
 * so an infallible Effect declares no exceptions.
 */
export type EffectExceptionMarkers<E> = [E] extends [never]
  ? never
  : CraftGenExceptionMarker<EffectExceptionOf<E>>;

/**
 * What `runEffect` returns: a generator that yields the Effect (which the
 * bridge runs) and additionally advertises, in its Yielded type only, the
 * craft exceptions `E` maps to.
 */
export type CraftEffectGen<A, E> = Generator<
  EffectExceptionMarkers<E> | Effect.Effect<A, E, never>,
  A,
  unknown
>;
