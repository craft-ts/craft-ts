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
  exhaustive<
    Value extends string | number,
    Handlers extends {
      [K in Value]: (value: K) => unknown;
    },
  >(
    value: Value,
    handlers: Handlers,
  ): ReturnType<Handlers[Value]>;

  /**
   * Exhaustively matches a discriminated object union. The callback receives
   * the member narrowed by `key`, including its exact payload.
   */
  exhaustive<
    Value extends object,
    Key extends {
      [K in keyof Value]-?: Value[K] extends string | number ? K : never;
    }[keyof Value],
    Handlers extends {
      [Code in Value[Key] & (string | number)]: (
        value: Extract<Value, Record<Key, Code>>,
      ) => unknown;
    },
  >(
    value: Value | undefined,
    key: Key,
    handlers: Handlers,
  ): ReturnType<Handlers[Value[Key] & (string | number)]> | undefined;

  exhaustive<
    Value extends object,
    Key extends {
      [K in keyof Value]-?: Value[K] extends string | number ? K : never;
    }[keyof Value],
    Handlers extends {
      [Code in Value[Key] & (string | number)]: (
        value: Extract<Value, Record<Key, Code>>,
      ) => unknown;
    },
  >(
    value: () => Value | undefined,
    key: Key,
    handlers: Handlers,
  ): ReturnType<Handlers[Value[Key] & (string | number)]> | undefined;
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
>(value: Value, handlers: Handlers): ReturnType<Handlers[Value]> {
  const handler = handlers[value] as (
    value: Value,
  ) => ReturnType<Handlers[Value]>;
  return handler(value);
}

function craftMatchObjectExhaustiveImpl(
  value: object | (() => object | undefined) | undefined,
  key: PropertyKey,
  handlers: Record<string | number, (value: object) => unknown>,
): unknown {
  const current = typeof value === 'function' ? value() : value;
  if (current === undefined) return undefined;
  const code = Reflect.get(current, key) as string | number;
  const handler = handlers[code];
  if (!handler) {
    throw new Error(
      `match.exhaustive(...) has no handler for discriminant "${String(code)}".`,
    );
  }
  return handler(current);
}

/**
 * Type-safe pattern matching over a bare literal union. Call it with a single
 * case (`craftMatch(value, 'a', handler)`) for an optional match, or use
 * {@link CraftMatch.exhaustive | `craftMatch.exhaustive`} with a handler map
 * for a compile-time-exhaustive match.
 */
export const craftMatch: CraftMatch = Object.assign(
  craftMatchImpl as CraftMatch,
  {
    exhaustive: ((
      value: unknown,
      keyOrHandlers: unknown,
      maybeHandlers?: unknown,
    ) =>
      maybeHandlers === undefined
        ? craftMatchExhaustiveImpl(
            value as string | number,
            keyOrHandlers as Record<
              string | number,
              (value: string | number) => unknown
            >,
          )
        : craftMatchObjectExhaustiveImpl(
            value as object | undefined,
            keyOrHandlers as PropertyKey,
            maybeHandlers as Record<
              string | number,
              (value: object) => unknown
            >,
          )) as CraftMatch['exhaustive'],
  },
);

/** Preferred short name for value and discriminated-union matching. */
export const match = craftMatch;
