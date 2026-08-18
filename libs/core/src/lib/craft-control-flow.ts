import { isCraftGenShortCircuit } from './craft-gen';
import { isCraftNotSettled } from './craft-settled';

/**
 * Returns whether `value` is an internal CraftTS control-flow throw.
 *
 * These values use JavaScript's exception channel to suspend or short-circuit
 * a computation until a CraftTS boundary handles them. They are expected
 * during normal rendering and must not be reported as application failures by
 * generic logging, snapshot, or error-conversion wrappers.
 *
 * An unhandled boundary error such as `CraftUnhandledPendingError` is not
 * included: it represents a missing template boundary and should remain
 * observable.
 */
export function isCraftControlFlow(value: unknown): boolean {
  return isCraftGenShortCircuit(value) || isCraftNotSettled(value);
}
