import type { Provider } from './host/craft-compat';
import { ɵbehaviorInvocationKey } from './behavior-proof-recorder';
import { isCraftException } from './craft-exception';
import { ɵHostTag } from './craft-service';
import { provideFnWrapper, type FnWrapper } from './fn-wrapper';

/**
 * A semantic mutant: the behaviour an obligation names, broken at runtime, so
 * that the tests said to prove it can show they notice. A test that still
 * passes exercised the behaviour without checking what it does.
 *
 * - `skip`: the invocation does nothing and returns nothing — the method, the
 *   mutation loader or the command that should have happened did not.
 * - `succeed`: the invocation runs, but its failure (a Craft exception value
 *   or a throw) is replaced by an empty success — the typed exception the
 *   obligation names never surfaces.
 *
 * `keys` are step keys of the behaviour proof recording
 * (`invocation:service:cart / method:add`): the dev-tools runner reads them
 * from the fingerprints of the tests it mutates.
 */
export type ɵBehaviorMutant = Readonly<{
  keys: readonly string[];
  mode: 'skip' | 'succeed';
}>;

/**
 * The wrapper that applies `mutant`; `onApplied` is told each time it
 * changed what an invocation did, so that a mutant no test reaches is not
 * mistaken for one every test survives.
 */
export function ɵprovideBehaviorMutant(
  mutant: ɵBehaviorMutant,
  onApplied: () => void = () => undefined,
): Provider {
  const keys = new Set(mutant.keys);
  const wrapper: FnWrapper = function* (factory, thisArg, args) {
    let hostTags: readonly string[];
    try {
      hostTags = yield* ɵHostTag();
    } catch {
      return yield* factory.apply(thisArg, args);
    }
    const key = ɵbehaviorInvocationKey(hostTags);
    if (!key || !keys.has(key)) return yield* factory.apply(thisArg, args);
    if (mutant.mode === 'skip') {
      onApplied();
      return undefined;
    }
    try {
      const result = yield* factory.apply(thisArg, args);
      if (!isCraftException(result)) return result;
    } catch {
      // Swallowed: the mutant is the success that should not have been.
    }
    onApplied();
    return undefined;
  };
  return provideFnWrapper(
    'Warning: dependency injection here is not type-safe and may fail at runtime',
    wrapper,
  );
}
