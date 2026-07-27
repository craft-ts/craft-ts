// ---------------------------------------------------------------------------
// Value-level pattern matching over a bare literal union (string/number/enum),
// the value counterpart to the exception-level `catchTag` / `catchTag.exhaustive`
// pair in `craft-program-operators`.
//
// ```ts
// type Status = 'active' | 'idle' | 'error';
//
// // Single case — runs the handler only when `status === 'active'`,
// // otherwise `undefined`.
// const label = craftMatch(status, 'active', () => 'Running');
//
// // Exhaustive — every member of the union needs a handler; a missing key
// // (or a key outside the union) is a compile error, and each handler
// // receives its own narrowed literal.
// const label = craftMatch.exhaustive(status, {
//   active: () => 'Running',
//   idle: () => 'Waiting',
//   error: () => 'Failed',
// });
// ```
//
// Exhaustiveness is enforced natively by the mapped handler type
// `{ [K in Value]: (value: K) => R }` — no `Exclude` gymnastics are needed
// because the union members *are* the required keys.
// ---------------------------------------------------------------------------

/**
 * A handler map over a literal union: exactly one handler per member, each
 * receiving its own narrowed literal.
 */
export type CraftMatchHandlers<Value extends string | number, R> = {
  [K in Value]: (value: K) => R;
};

interface CraftMatch {
  /**
   * Matches a single case of a literal union. When `value` equals `matchCase`
   * the handler runs (with `value` narrowed to `matchCase`) and its result is
   * returned; otherwise the result is `undefined`.
   */
  <Value extends string | number, Case extends Value, R>(
    value: Value,
    matchCase: Case,
    handler: (value: Case) => R,
  ): R | undefined;

  /**
   * Matches **every** member of a literal union through a handler map covering
   * exactly that union — a missing member or a key outside the union is a
   * compile error, and each handler receives its own narrowed literal. The
   * result is the union of the handlers' return types.
   */
  exhaustive: <
    Value extends string | number,
    Handlers extends {
      [K in Value]: (value: K) => unknown;
    },
  >(
    value: Value,
    handlers: Handlers,
  ) => ReturnType<Handlers[Value]>;
}

function craftMatchImpl<Value extends string | number, Case extends Value, R>(
  value: Value,
  matchCase: Case,
  handler: (value: Case) => R,
): R | undefined {
  return value === matchCase ? handler(value as Case) : undefined;
}

function craftMatchExhaustiveImpl<
  Value extends string | number,
  Handlers extends CraftMatchHandlers<Value, any>,
>(
  value: Value,
  handlers: Handlers,
): ReturnType<Handlers[Value]> {
  const handler = handlers[value] as (
    value: Value,
  ) => ReturnType<Handlers[Value]>;
  return handler(value);
}

/**
 * Type-safe pattern matching over a bare literal union. Call it with a single
 * case (`craftMatch(value, 'a', handler)`) for an optional match, or use
 * {@link CraftMatch.exhaustive | `craftMatch.exhaustive`} with a handler map
 * for a compile-time-exhaustive match.
 */
export const craftMatch: CraftMatch = Object.assign(
  craftMatchImpl as CraftMatch,
  { exhaustive: craftMatchExhaustiveImpl },
);
