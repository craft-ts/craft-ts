import { DestroyRef, type Injector, type Provider } from './host/craft-compat';
import { runCraftGenerator } from './craft-generator-runtime';

export type CraftTargetKind = 'component' | 'directive';

export type CraftTargetContext = Readonly<{
  target: unknown;
  kind: CraftTargetKind;
  name: string;
  ref: unknown;
  hostName: string;
  injector: Injector;
}>;

export type CraftTargetContextOverrides = Readonly<{
  hostName?: string;
}>;

export type CraftTargetRelease = () => void;

export type CraftTargetWrapper = (
  context: CraftTargetContext,
  next: (
    overrides?: CraftTargetContextOverrides,
  ) => Generator<unknown, CraftTargetRelease, unknown>,
) => Generator<unknown, CraftTargetRelease, unknown>;

export const CRAFT_TARGET_WRAPPER = Object.freeze({});

/** Adds a wrapper around the lifecycle registration of Craft targets. */
export function provideCraftTargetWrapper(
  _warning: string,
  wrapper: CraftTargetWrapper,
): Provider {
  return { provide: CRAFT_TARGET_WRAPPER, useValue: wrapper, multi: true };
}

const EMPTY_RELEASE: CraftTargetRelease = () => undefined;
type CraftTargetWrapperRunner = (
  context: CraftTargetContext,
) => Generator<unknown, CraftTargetRelease, unknown>;

const NO_TARGET_WRAPPERS: readonly CraftTargetWrapper[] = [];

/** @internal The target wrappers visible from `injector`. */
export function ɵcraftTargetWrappers(
  injector: Injector,
): readonly CraftTargetWrapper[] {
  return injector.get(CRAFT_TARGET_WRAPPER as never, NO_TARGET_WRAPPERS);
}

/**
 * @internal What registering a target amounts to where no wrapper exists:
 * the same no-op release, inscribed like any other.
 */
export function ɵreleaseWithoutTargetWrappers(
  injector: Injector,
  autoCleanup: boolean,
): CraftTargetRelease {
  if (autoCleanup) {
    injector.get(DestroyRef, null)?.onDestroy(EMPTY_RELEASE);
  }
  return EMPTY_RELEASE;
}

export function ɵrunCraftTargetWrappers(
  injector: Injector,
  context: CraftTargetContext,
  autoCleanup: boolean,
  /** {@link ɵcraftTargetWrappers} of `injector`, when the caller has them. */
  wrappers: readonly CraftTargetWrapper[] = ɵcraftTargetWrappers(injector),
): CraftTargetRelease {
  // Without a wrapper the chain is one empty generator that returns
  // EMPTY_RELEASE: skip driving it, keep the same release and its inscription.
  if (wrappers.length === 0) {
    return ɵreleaseWithoutTargetWrappers(injector, autoCleanup);
  }
  let next: CraftTargetWrapperRunner = function* () {
    return EMPTY_RELEASE;
  };

  for (let index = wrappers.length - 1; index >= 0; index -= 1) {
    const wrapper = wrappers[index]!;
    const inner = next;
    next = (current) =>
      (function* () {
        return yield* wrapper(current, (overrides) =>
          inner({ ...current, ...overrides }),
        );
      })();
  }

  const release = runCraftGenerator({
    iterator: next(context),
    injector,
    hostScope: 'function',
    invalidYieldErrorMessage:
      'Craft target wrappers can only yield Craft dependencies.',
    multipleAppStartErrorMessage:
      'Craft target wrappers cannot declare app-start hooks more than once.',
    onAppStartNotSupportedErrorMessage:
      'Craft target wrappers cannot declare app-start hooks.',
  }).value as CraftTargetRelease;
  if (autoCleanup) {
    injector.get(DestroyRef, null)?.onDestroy(release);
  }
  return release;
}
