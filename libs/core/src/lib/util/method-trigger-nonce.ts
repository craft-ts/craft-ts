import { ValueEqualityFn } from '@angular/core';

/**
 * Internal machinery that forces a method-based primitive (`query` / `mutation` /
 * `asyncProcess`) to re-run its loader on every explicit call, even when the
 * `method` returns the same value or `undefined`.
 *
 * Angular's native `resource()` (a) treats an `undefined` request as idle and never
 * runs the loader, and (b) only re-runs the loader when the request changes under
 * `Object.is`. A `method: () => undefined` (e.g. a logout mutation) therefore never
 * triggers, and a `method: () => 'X'` triggers at most once.
 *
 * The fix wraps the raw params in a nonce-tagged object `{ params, seq }` that is
 * always defined and whose `seq` increments on every call, so the request always
 * changes. The wrapper is unwrapped inside the primitive's `wrappedLoader` before it
 * reaches the user loader, so nothing downstream ever observes it. The public
 * `resourceParamsSrc` signal keeps holding the raw params.
 *
 * A unique symbol key guarantees the wrapper cannot collide with user param object
 * keys and makes {@link isMethodParamsWrapper} unambiguous.
 */
const METHOD_TRIGGER_NONCE = Symbol('craftMethodTriggerNonce');

interface MethodParamsWrapper<P> {
  [METHOD_TRIGGER_NONCE]: { params: P | undefined; seq: number };
}

/** Tag raw params with the current call sequence so the request always changes. */
export function wrapMethodParams<P>(
  params: P | undefined,
  seq: number,
): MethodParamsWrapper<P> {
  return { [METHOD_TRIGGER_NONCE]: { params, seq } };
}

export function isMethodParamsWrapper(
  value: unknown,
): value is MethodParamsWrapper<unknown> {
  return (
    typeof value === 'object' && value !== null && METHOD_TRIGGER_NONCE in value
  );
}

/**
 * Return the raw params from a wrapper, or the value untouched when it is not a
 * wrapper. Idempotent and safe on plain params, so it can be applied unconditionally
 * (source / params-fn / byId modes pass through unchanged).
 */
export function unwrapMethodParams<P>(
  value: P | MethodParamsWrapper<P>,
): P | undefined {
  return isMethodParamsWrapper(value)
    ? (value[METHOD_TRIGGER_NONCE].params as P)
    : (value as P);
}

/**
 * Build an equality function for the wrapped request: a different `seq` always
 * forces a re-run; an identical `seq` delegates to the user-provided `equal` (or
 * `Object.is`) on the *unwrapped* value. Non-wrapped values fall back to the same
 * base rule, so this is safe to pass even when the wrapper is not in play.
 */
export function methodParamsWrapperEqual<P>(
  userEqual?: (a: P, b: P) => boolean,
): ValueEqualityFn<unknown> {
  const base = userEqual ?? ((a: P, b: P) => Object.is(a, b));
  return (a, b) => {
    if (isMethodParamsWrapper(a) && isMethodParamsWrapper(b)) {
      const wrappedA = (a as MethodParamsWrapper<P>)[METHOD_TRIGGER_NONCE];
      const wrappedB = (b as MethodParamsWrapper<P>)[METHOD_TRIGGER_NONCE];
      if (wrappedA.seq !== wrappedB.seq) {
        return false;
      }
      return base(wrappedA.params as P, wrappedB.params as P);
    }
    return base(a as P, b as P);
  };
}
