import { Effect } from 'effect';

// ---------------------------------------------------------------------------
// Task 3.1 — fine-grained selection over an Effect service.
//
// THE TRAP THIS FILE EXISTS TO AVOID. The obvious implementation maps each
// selected member through a wrapper — to record a graph edge, to allow mocking,
// whatever. Doing so DESTROYS generic members: a wrapper declared as
// `(...args: A) => Effect<X, E>` freezes A, X and E at the wrapper's own type
// parameters, and every generic call site collapses to the constraint. It is
// the same failure as a higher-order insertion over `query()` that forgets to
// return a generic factory.
//
// The way out is to not map at all. The selector PICKS members; the result type
// is literally the selector's return type, so each member keeps its own
// signature — generics, overloads and inferred `E` included. At runtime the
// members are the originals, not proxies.
//
// What the selection buys, then, is not a different runtime: a Layer builds the
// whole service either way. It buys the dependency-graph edge, a narrower type
// surface, and per-member mocking.
// ---------------------------------------------------------------------------

/**
 * Resolves an Effect service from the level in force, optionally narrowed to
 * the members you actually use.
 *
 * @example
 * // whole service
 * const api = yield* effectService(UserApi);
 *
 * // just the members this component depends on — the form that buys the graph
 * const { byId } = yield* effectService(UserApi, ({ byId }) => ({ byId }));
 * const user = yield* byId('u-1');
 */
export function effectService<Self, Shape>(
  tag: Effect.Effect<Shape, never, Self>,
): Effect.Effect<Shape, never, Self>;
export function effectService<Self, Shape, Selected>(
  tag: Effect.Effect<Shape, never, Self>,
  select: (service: Shape) => Selected,
): Effect.Effect<Selected, never, Self>;
export function effectService<Self, Shape, Selected>(
  tag: Effect.Effect<Shape, never, Self>,
  select?: (service: Shape) => Selected,
): Effect.Effect<Shape | Selected, never, Self> {
  return select ? Effect.map(tag, select) : tag;
}

/**
 * The members a selector picked, as a type. Used by the graph work of task 3.3
 * to name the edge `Consumer -> Service.member` rather than `Consumer -> Service`.
 */
export type SelectedMembers<Selector> = Selector extends (
  service: never,
) => infer Selected
  ? keyof Selected & string
  : never;
