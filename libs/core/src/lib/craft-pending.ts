import {
  ChangeDetectionStrategy,
  Component,
  inject,
  InjectionToken,
  LOCALE_ID,
  signal,
  type Provider,
  type Signal,
  type Type,
} from '@angular/core';

/**
 * The non-blocking router outlet ({@link CraftRouterOutlet}) commits the URL
 * immediately, then runs the route's guard/resolve chain through three phases
 * while it is in flight:
 *
 * 1. **stay** ({@link CRAFT_STAY_MS}) — the PREVIOUS page is kept on screen, so a
 *    chain that settles quickly transitions straight to the target with no flash;
 * 2. **blank** ({@link CRAFT_BLANK_MS}) — a blank surface, signalling the page is
 *    changing;
 * 3. **pending** — the configured pending component (loader), held for at least
 *    {@link CRAFT_PENDING_MIN_MS} to avoid flicker.
 *
 * The target component is mounted only once the chain succeeds.
 *
 * This module owns the pending UI surface: the default pending component, the
 * DI tokens that parameterise it (component, loading text, phase thresholds,
 * and the global error component), and the {@link provideCraftLoading} feature
 * builder used to override them at the application root.
 */

const CRAFT_LOADING_TEXT_BY_LANGUAGE: Readonly<Record<string, string>> = {
  en: 'Loading…',
  fr: 'Chargement…',
};

const DEFAULT_CRAFT_LOADING_LANGUAGE = 'en';

function resolveLoadingTextForLocale(locale: string): string {
  const language = locale.split('-')[0]?.toLowerCase() ?? '';

  return (
    CRAFT_LOADING_TEXT_BY_LANGUAGE[language] ??
    CRAFT_LOADING_TEXT_BY_LANGUAGE[DEFAULT_CRAFT_LOADING_LANGUAGE]
  );
}

/**
 * The text rendered by {@link DefaultCraftPendingComponent}. A `Signal<string>`
 * so a reactive translation source can be plugged in via {@link withLoadingText}.
 *
 * The default reads {@link LOCALE_ID} and picks a built-in translation (English
 * and French shipped; unknown locales fall back to English).
 */
export const CRAFT_LOADING_TEXT = new InjectionToken<Signal<string>>(
  'CRAFT_LOADING_TEXT',
  {
    providedIn: 'root',
    factory: () => signal(resolveLoadingTextForLocale(inject(LOCALE_ID))),
  },
);

/**
 * The default pending component: a single element rendering {@link CRAFT_LOADING_TEXT}.
 * Override globally with {@link withPendingComponent} or per route via the
 * route's `pendingComponent` field.
 */
@Component({
  selector: 'craft-pending',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="craft-pending">{{ loading() }}</div>`,
  styles: [
    `
      .craft-pending {
        padding: 1rem;
        font-family:
          system-ui,
          -apple-system,
          sans-serif;
        color: #6b7280;
      }
    `,
  ],
})
export class DefaultCraftPendingComponent {
  readonly loading = inject(CRAFT_LOADING_TEXT);
}

/**
 * The component (loader) shown in the **pending** phase — once both
 * {@link CRAFT_STAY_MS} and {@link CRAFT_BLANK_MS} have elapsed and the route's
 * guard/resolve chain is still in flight. Defaults to
 * {@link DefaultCraftPendingComponent}.
 */
export const CRAFT_PENDING_COMPONENT = new InjectionToken<Type<unknown>>(
  'CRAFT_PENDING_COMPONENT',
  { providedIn: 'root', factory: () => DefaultCraftPendingComponent },
);

/**
 * Phase 1 duration (ms): how long the outlet keeps the **previous page** on
 * screen after the URL commits, before blanking it. A chain that settles within
 * this window transitions straight to the target — no blank, no loader.
 * Defaults to `300`.
 */
export const CRAFT_STAY_MS = new InjectionToken<number>('CRAFT_STAY_MS', {
  providedIn: 'root',
  factory: () => 300,
});

/**
 * Phase 2 duration (ms): how long the outlet shows a **blank** surface (after
 * {@link CRAFT_STAY_MS}) before showing the pending component (loader). A chain
 * that settles within this window transitions straight to the target without
 * ever flashing the loader. Defaults to `300`.
 */
export const CRAFT_BLANK_MS = new InjectionToken<number>('CRAFT_BLANK_MS', {
  providedIn: 'root',
  factory: () => 300,
});

/**
 * Phase 3 anti-flicker (ms): once the pending component (loader) is shown, keep
 * it visible for at least this long so a chain that settles right after the
 * loader appears does not blink it in and out. Defaults to `0` (no minimum).
 */
export const CRAFT_PENDING_MIN_MS = new InjectionToken<number>(
  'CRAFT_PENDING_MIN_MS',
  { providedIn: 'root', factory: () => 0 },
);

/**
 * The application-wide global error component, rendered by the outlet when a
 * route exception handler delegates to `globalError()`. `null` until configured
 * via {@link withErrorComponent}; the global error component reads its (typed)
 * exception with `injectCraftGlobalError()`.
 */
export const CRAFT_ERROR_COMPONENT = new InjectionToken<Type<unknown> | null>(
  'CRAFT_ERROR_COMPONENT',
  { providedIn: 'root', factory: () => null },
);

const CRAFT_LOADING_FEATURE = Symbol('craft-loading-feature');

/**
 * An opaque unit of pending/error configuration produced by a `with*` helper and
 * consumed by {@link provideCraftLoading}. Mirrors Angular's `provideRouter`
 * feature pattern so config reads as `provideCraftLoading(withX(), withY())`.
 */
export interface CraftLoadingFeature {
  readonly [CRAFT_LOADING_FEATURE]: true;
  readonly providers: Provider[];
}

/**
 * Builds an opaque {@link CraftLoadingFeature} from a provider list. Shared with
 * sibling loading features (e.g. `withCraftViewTransitions`) so they all flow
 * through {@link provideCraftLoading} / {@link isCraftLoadingFeature}.
 */
export function craftLoadingFeature(providers: Provider[]): CraftLoadingFeature {
  return { [CRAFT_LOADING_FEATURE]: true, providers };
}

/**
 * Runtime guard distinguishing a {@link CraftLoadingFeature} (produced by a
 * `with*` loading helper) from any other value — notably an Angular
 * `RouterFeature`. Lets {@link provideCraftRouter} accept loading and router
 * features mixed in a single call and split them apart.
 */
export function isCraftLoadingFeature(
  value: unknown,
): value is CraftLoadingFeature {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [CRAFT_LOADING_FEATURE]?: unknown })[CRAFT_LOADING_FEATURE] ===
      true
  );
}

/** Override the pending component shown while a route chain is in flight. */
export function withPendingComponent(
  component: Type<unknown>,
): CraftLoadingFeature {
  return craftLoadingFeature([
    { provide: CRAFT_PENDING_COMPONENT, useValue: component },
  ]);
}

/**
 * Override the loading text rendered by {@link DefaultCraftPendingComponent}.
 * The factory runs in an injection context, so it may read a translation
 * service and return a reactive `Signal<string>`.
 */
export function withLoadingText(
  factory: () => Signal<string>,
): CraftLoadingFeature {
  return craftLoadingFeature([
    { provide: CRAFT_LOADING_TEXT, useFactory: factory },
  ]);
}

/**
 * Override the navigation transition timings (in ms):
 *
 * - `stayMs` — phase 1, how long the previous page is kept on screen;
 * - `blankMs` — phase 2, how long the blank surface is shown before the loader;
 * - `pendingMinMs` — phase 3, minimum time the loader stays once shown.
 *
 * Only the provided keys are overridden.
 */
export function withTransitionTimings(thresholds: {
  stayMs?: number;
  blankMs?: number;
  pendingMinMs?: number;
}): CraftLoadingFeature {
  const providers: Provider[] = [];

  if (thresholds.stayMs !== undefined) {
    providers.push({ provide: CRAFT_STAY_MS, useValue: thresholds.stayMs });
  }

  if (thresholds.blankMs !== undefined) {
    providers.push({ provide: CRAFT_BLANK_MS, useValue: thresholds.blankMs });
  }

  if (thresholds.pendingMinMs !== undefined) {
    providers.push({
      provide: CRAFT_PENDING_MIN_MS,
      useValue: thresholds.pendingMinMs,
    });
  }

  return craftLoadingFeature(providers);
}

/** Register the application-wide global error component (see `globalError()`). */
export function withErrorComponent(
  component: Type<unknown>,
): CraftLoadingFeature {
  return craftLoadingFeature([
    { provide: CRAFT_ERROR_COMPONENT, useValue: component },
  ]);
}

/**
 * Configures the {@link CraftRouterOutlet} pending/error surface.
 *
 * ```ts
 * provideCraftLoading(
 *   withTransitionTimings({ stayMs: 300, blankMs: 300, pendingMinMs: 500 }),
 *   withLoadingText(() => computed(() => translate('common.loading'))),
 *   withPendingComponent(MyBrandedSpinner),
 *   withErrorComponent(MyGlobalErrorScreen),
 * )
 * ```
 */
export function provideCraftLoading(
  ...features: CraftLoadingFeature[]
): Provider[] {
  return features.flatMap((feature) => feature.providers);
}
