import {
  DestroyRef,
  InjectionToken,
  type Injector,
  type Provider,
} from '@angular/core';
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

export const CRAFT_TARGET_WRAPPER = new InjectionToken<
  readonly CraftTargetWrapper[]
>('CRAFT_TARGET_WRAPPER', {
  providedIn: 'root',
  factory: () => [],
});

/** Adds a wrapper around the lifecycle registration of Craft targets. */
export function provideCraftTargetWrapper(
  _warning: string,
  wrapper: CraftTargetWrapper,
): Provider {
  return {
    provide: CRAFT_TARGET_WRAPPER,
    useValue: wrapper,
    multi: true,
  };
}

const EMPTY_RELEASE: CraftTargetRelease = () => undefined;
type CraftTargetWrapperRunner = (
  context: CraftTargetContext,
) => Generator<unknown, CraftTargetRelease, unknown>;

export function ɵrunCraftTargetWrappers(
  injector: Injector,
  context: CraftTargetContext,
  autoCleanup: boolean,
): CraftTargetRelease {
  const wrappers = injector.get(CRAFT_TARGET_WRAPPER, []);
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
