import { signal, type Provider, type Signal } from './host/craft-compat';
import { craftService, type CraftServiceProvider } from './craft-service';
import { craftLoadingFeature, type CraftLoadingFeature } from './craft-pending';

/**
 * The marker a route stores in `withLoaderViewTransitionImage` to declare the
 * shape `T` of its shared-element payload — the view-transition analogue of how
 * `queryParams` declares the shape of a route's query params. `T` flows into:
 * the REQUIRED `viewTransition` field on every `craftRouterLink` / `navigate`
 * targeting the route (as `T | null`), and the generated, typed
 * `injectXxxViewTransition(): Signal<T | null>` helper the pending skeleton (or
 * target) reads.
 *
 * The phantom property is a plain (string-keyed, required) brand rather than a
 * `unique symbol`: this marker rides along inside the route definition that the
 * parent `app.routes` path registry materializes through `loadChildren`, and
 * that registry sits at TypeScript's instantiation-depth ceiling — a symbol-
 * keyed phantom measurably costs more there. The required key also keeps a bare
 * `{}` from structurally matching the marker.
 */
export interface ViewTransitionPayloadDef<T> {
  readonly __craftViewTransitionPayload: T;
}

/**
 * Declares the shared-element payload shape `T` for a view-transition route.
 * Place it on `withLoaderViewTransitionImage` exactly like `queryParams`:
 *
 * ```ts
 * craftRoute(':photoId', {
 *   withLoaderViewTransitionImage: viewTransitionPayload<{ name: string; image: string | null }>(),
 *   // ...
 * })
 * ```
 *
 * Returns an empty runtime marker — `T` lives purely at the type level (carried
 * by the phantom {@link ViewTransitionPayloadDef} brand).
 */
export function viewTransitionPayload<T>(): ViewTransitionPayloadDef<T> {
  return {} as ViewTransitionPayloadDef<T>;
}

/**
 * What a navigation transports for a view-transition route. Deliberately loose
 * at the transport layer ({@link CRAFT_VIEW_TRANSITION} is a single global sink
 * shared by every view-transition route): the per-route generated helpers
 * narrow it to the declared `T | null`. `null` opts out of the morph explicitly.
 */
export type CraftViewTransitionInput = unknown;

/**
 * Key under which the view-transition payload travels in Angular's navigation
 * `state` (history state). The outlet reads it from the current navigation and
 * republishes it through {@link CRAFT_VIEW_TRANSITION}.
 */
export const CRAFT_VIEW_TRANSITION_STATE_KEY = '__craftViewTransition';

/**
 * The view-transition payload for the current navigation, as a signal the
 * outlet writes and the skeleton/target read (via {@link
 * injectCraftViewTransition}). `null` between/without view-transition
 * navigations.
 */
const craftViewTransitionService = craftService(
  { name: 'CraftViewTransition', providedIn: 'toProvide' },
  (inputs: { $provided?: Signal<CraftViewTransitionInput> }) =>
    inputs.$provided ?? signal<CraftViewTransitionInput>(null),
) as unknown as {
  CraftViewTransition: () => Generator<unknown, Signal<CraftViewTransitionInput>, unknown>;
  provideCraftViewTransition: (
    value: Signal<CraftViewTransitionInput>,
  ) => CraftServiceProvider;
  CRAFT_VIEW_TRANSITION_META_DATA: {
    inject(): Signal<CraftViewTransitionInput>;
  };
};

export const CraftViewTransition = craftViewTransitionService.CraftViewTransition;
export const provideCraftViewTransition = (
  value: Signal<CraftViewTransitionInput>,
): CraftServiceProvider => craftViewTransitionService.provideCraftViewTransition(value);
export const ɵinjectCraftViewTransition = (): Signal<CraftViewTransitionInput> =>
  craftViewTransitionService.CRAFT_VIEW_TRANSITION_META_DATA.inject();

/** Reads the current navigation's view-transition payload (see {@link CRAFT_VIEW_TRANSITION}). */
export function injectCraftViewTransition(): Signal<CraftViewTransitionInput> {
  return ɵinjectCraftViewTransition();
}

/** Whether the outlet should drive `document.startViewTransition()` around its swaps. */
const craftViewTransitionsEnabledService = craftService(
  { name: 'CraftViewTransitionsEnabled', providedIn: 'toProvide' },
  (inputs: { $provided?: boolean }) => inputs.$provided ?? false,
) as unknown as {
  CraftViewTransitionsEnabled: () => Generator<unknown, boolean, unknown>;
  provideCraftViewTransitionsEnabled: (value: boolean) => CraftServiceProvider;
  CRAFT_VIEW_TRANSITIONS_ENABLED_META_DATA: { inject(): boolean };
};
export const CraftViewTransitionsEnabled =
  craftViewTransitionsEnabledService.CraftViewTransitionsEnabled;
export const provideCraftViewTransitionsEnabled = (value: boolean): CraftServiceProvider =>
  craftViewTransitionsEnabledService.provideCraftViewTransitionsEnabled(value);
export const ɵinjectCraftViewTransitionsEnabled = (): boolean =>
  craftViewTransitionsEnabledService.CRAFT_VIEW_TRANSITIONS_ENABLED_META_DATA.inject();

/**
 * Whether the outlet should skip the `'blank'` phase while view transitions are
 * enabled. A blank surface between the previous page and the skeleton breaks the
 * shared-element morph, so routes that declare a `withLoaderViewTransitionImage`
 * payload always skip blank; this token lets `withCraftViewTransitions({ skipBlank })`
 * extend that to every route.
 */
const craftViewTransitionSkipBlankService = craftService(
  { name: 'CraftViewTransitionSkipBlank', providedIn: 'toProvide' },
  (inputs: { $provided?: boolean }) => inputs.$provided ?? false,
) as unknown as {
  CraftViewTransitionSkipBlank: () => Generator<unknown, boolean, unknown>;
  provideCraftViewTransitionSkipBlank: (value: boolean) => CraftServiceProvider;
  CRAFT_VIEW_TRANSITION_SKIP_BLANK_META_DATA: { inject(): boolean };
};
export const CraftViewTransitionSkipBlank =
  craftViewTransitionSkipBlankService.CraftViewTransitionSkipBlank;
export const provideCraftViewTransitionSkipBlank = (value: boolean): CraftServiceProvider =>
  craftViewTransitionSkipBlankService.provideCraftViewTransitionSkipBlank(value);
export const ɵinjectCraftViewTransitionSkipBlank = (): boolean =>
  craftViewTransitionSkipBlankService.CRAFT_VIEW_TRANSITION_SKIP_BLANK_META_DATA.inject();

/** Runs `cb` inside a view transition. The seam tests override to capture the callback. */
export type CraftStartViewTransition = (cb: () => void) => void;

interface ViewTransitionDocument {
  startViewTransition?: (cb: () => void) => unknown;
}

/**
 * The function the outlet uses to bracket a swap in a view transition. The
 * default wraps `document.startViewTransition()`, but falls back to running
 * `cb` directly when the API is missing or the user prefers reduced motion.
 * Overridable in tests to capture the callback deterministically.
 */
const craftStartViewTransitionService = craftService(
  { name: 'CraftStartViewTransition', providedIn: 'toProvide' },
  (inputs: { $provided?: CraftStartViewTransition }) =>
    inputs.$provided ?? defaultStartViewTransition,
) as unknown as {
  CraftStartViewTransition: () => Generator<unknown, CraftStartViewTransition, unknown>;
  provideCraftStartViewTransition: (value: CraftStartViewTransition) => CraftServiceProvider;
  CRAFT_START_VIEW_TRANSITION_META_DATA: { inject(): CraftStartViewTransition };
};
export const CraftStartViewTransition = craftStartViewTransitionService.CraftStartViewTransition;
export const provideCraftStartViewTransition = (
  value: CraftStartViewTransition,
): CraftServiceProvider => craftStartViewTransitionService.provideCraftStartViewTransition(value);
export const ɵinjectCraftStartViewTransition = (): CraftStartViewTransition =>
  craftStartViewTransitionService.CRAFT_START_VIEW_TRANSITION_META_DATA.inject();

function defaultStartViewTransition(cb: () => void): void {
  const doc =
    typeof document !== 'undefined'
      ? (document as unknown as ViewTransitionDocument)
      : undefined;
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!doc?.startViewTransition || prefersReducedMotion) {
    cb();
    return;
  }

  // Chromium can expose the API while failing to invoke the update callback
  // when a transition is started during router activation. Never leave the
  // outlet waiting forever for that callback: the fallback still commits the
  // new DOM, while the idempotent wrapper prevents a later native callback
  // from committing twice.
  let callbackCalled = false;
  const runOnce = () => {
    if (callbackCalled) {
      return;
    }
    callbackCalled = true;
    cb();
  };

  const transition = doc.startViewTransition(runOnce) as
    | {
        skipTransition?: () => void;
        ready?: Promise<unknown>;
        updateCallbackDone?: Promise<unknown>;
        finished?: Promise<unknown>;
      }
    | undefined;
  for (const promise of [
    transition?.ready,
    transition?.updateCallbackDone,
    transition?.finished,
  ]) {
    void promise?.catch(() => undefined);
  }
  queueMicrotask(() => {
    if (callbackCalled) {
      return;
    }
    runOnce();
    transition?.skipTransition?.();
  });
}

/**
 * Hands the {@link CraftRouterOutletController} control of the browser View
 * Transitions
 * API. Unlike Angular's `withViewTransitions()` — which brackets only the
 * synchronous URL commit — this drives `document.startViewTransition()` around
 * the outlet's *own* swaps (`previous page → skeleton → target`), so a
 * shared-element morph survives a slow guard/resolve chain.
 *
 * Routes that declare a `withLoaderViewTransitionImage` payload (via {@link
 * viewTransitionPayload}) additionally skip the `'blank'` phase (a blank surface
 * would break the morph) and require every `craftRouterLink` / `navigate`
 * targeting them to pass a typed `viewTransition` payload. Pass
 * `{ skipBlank: true }` to extend the blank-skip to all routes.
 *
 * ```ts
 * provideCraftRouter(
 *   demoRoutes.toRoutes(),
 *   withCraftViewTransitions(),
 * )
 * ```
 */
export function withCraftViewTransitions(options?: {
  skipBlank?: boolean;
}): CraftLoadingFeature {
  return craftLoadingFeature([
    provideCraftViewTransitionsEnabled(true),
    provideCraftViewTransitionSkipBlank(options?.skipBlank ?? false),
  ]);
}

/** Default router outlet dependencies, installed by provideCraftRouter. */
export function ɵprovideCraftViewTransitionDefaults(): Provider[] {
  return [
    provideCraftViewTransition(signal<CraftViewTransitionInput>(null)) as Provider,
    provideCraftViewTransitionsEnabled(false) as Provider,
    provideCraftViewTransitionSkipBlank(false) as Provider,
    provideCraftStartViewTransition(defaultStartViewTransition) as Provider,
  ];
}
