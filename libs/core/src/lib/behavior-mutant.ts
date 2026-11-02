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

/**
 * Where an end-to-end run puts the mutant for the page to read, and the
 * binding the page calls once it applied it. `@craft-ts/playwright-sessions`
 * sets both (an init script and `exposeBinding`, so that they survive a
 * navigation); keep the two names in step with its `behavior-mutant.ts`.
 */
export const ɵBEHAVIOR_MUTANT_PAGE_GLOBAL = '__craftBehaviorMutant';
export const ɵBEHAVIOR_MUTANT_APPLIED_BINDING = '__craftBehaviorMutantApplied';

/**
 * The mutant an end-to-end run asked this page for, or nothing: inert in
 * every page no mutant run opened. Part of `provideCraftDevTools`, so an app
 * with the dev tools can have its e2e tests mutated without any change.
 */
export function ɵprovidePageBehaviorMutant(): readonly Provider[] {
  const page = globalThis as typeof globalThis & {
    [ɵBEHAVIOR_MUTANT_PAGE_GLOBAL]?: unknown;
    [ɵBEHAVIOR_MUTANT_APPLIED_BINDING]?: () => unknown;
  };
  const requested = page[ɵBEHAVIOR_MUTANT_PAGE_GLOBAL];
  if (!isBehaviorMutant(requested)) return [];
  return [
    ɵprovideBehaviorMutant(requested, () => {
      void page[ɵBEHAVIOR_MUTANT_APPLIED_BINDING]?.();
    }),
  ];
}

function isBehaviorMutant(value: unknown): value is ɵBehaviorMutant {
  if (typeof value !== 'object' || value === null) return false;
  const { keys, mode } = value as Record<string, unknown>;
  return (
    Array.isArray(keys) &&
    keys.every((key) => typeof key === 'string') &&
    (mode === 'skip' || mode === 'succeed')
  );
}
