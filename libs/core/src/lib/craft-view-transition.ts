import { inject, InjectionToken, signal, type Signal } from '@angular/core';
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
 * route(':photoId', {
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
export const CRAFT_VIEW_TRANSITION = new InjectionToken<
  Signal<CraftViewTransitionInput>
>('CRAFT_VIEW_TRANSITION', {
  providedIn: 'root',
  factory: () => signal<CraftViewTransitionInput>(null),
});

/** Reads the current navigation's view-transition payload (see {@link CRAFT_VIEW_TRANSITION}). */
export function injectCraftViewTransition(): Signal<CraftViewTransitionInput> {
  return inject(CRAFT_VIEW_TRANSITION);
}

/** Whether the outlet should drive `document.startViewTransition()` around its swaps. */
export const CRAFT_VIEW_TRANSITIONS_ENABLED = new InjectionToken<boolean>(
  'CRAFT_VIEW_TRANSITIONS_ENABLED',
  { providedIn: 'root', factory: () => false },
);

/**
 * Whether the outlet should skip the `'blank'` phase while view transitions are
 * enabled. A blank surface between the previous page and the skeleton breaks the
 * shared-element morph, so routes that declare a `withLoaderViewTransitionImage`
 * payload always skip blank; this token lets `withCraftViewTransitions({ skipBlank })`
 * extend that to every route.
 */
export const CRAFT_VIEW_TRANSITION_SKIP_BLANK = new InjectionToken<boolean>(
  'CRAFT_VIEW_TRANSITION_SKIP_BLANK',
  { providedIn: 'root', factory: () => false },
);

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
export const CRAFT_START_VIEW_TRANSITION =
  new InjectionToken<CraftStartViewTransition>('CRAFT_START_VIEW_TRANSITION', {
    providedIn: 'root',
    factory: () => defaultStartViewTransition,
  });

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

  doc.startViewTransition(cb);
}

/**
 * Hands the {@link CraftRouterOutlet} control of the browser View Transitions
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
    { provide: CRAFT_VIEW_TRANSITIONS_ENABLED, useValue: true },
    {
      provide: CRAFT_VIEW_TRANSITION_SKIP_BLANK,
      useValue: options?.skipBlank ?? false,
    },
  ]);
}
