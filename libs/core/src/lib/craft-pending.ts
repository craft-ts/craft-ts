import {
  inject,
  LOCALE_ID,
  signal,
  type Provider,
  type Signal,
} from './host/craft-compat';
import { craftService } from './craft-service';
import type { CraftExceptionComponentDescriptor } from './craft-route-exceptions';
import {
  craftRouteTarget,
  type CraftRouteTargetInput,
} from './craft-route-target';

/**
 * The non-blocking router outlet ({@link CraftRouterOutletController}) commits
 * the URL
 * immediately, then runs the route's guard/resolve chain through three phases
 * while it is in flight:
 *
 * 1. **stay** ({@link CraftStayMs}) — the PREVIOUS page is kept on screen, so a
 *    chain that settles quickly transitions straight to the target with no flash;
 * 2. **blank** ({@link CraftBlankMs}) — a blank surface, signalling the page is
 *    changing;
 * 3. **pending** — the configured pending component (loader), held for at least
 *    {@link CraftPendingMinMs} to avoid flicker.
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
let defaultCraftPendingComponent: CraftRouteTargetInput | undefined;

/**
 * Installs the real loader. `@craft-ts/component` calls this on import, since
 * rendering anything at all needs the renderer that only it owns.
 */
export function ɵregisterDefaultCraftPendingComponent(
  component: CraftRouteTargetInput,
): void {
  defaultCraftPendingComponent = component;
}

/**
 * Core alone can render nothing, so the fallback is an empty target rather
 * than a throw: a router used without `@craft-ts/component` still navigates,
 * it just shows nothing during the pending phase.
 */
function getDefaultCraftPendingComponent(): CraftRouteTargetInput {
  return defaultCraftPendingComponent ?? craftRouteTarget(null);
}

/**
 * The component (loader) shown in the **pending** phase — once both
 * {@link CraftStayMs} and {@link CraftBlankMs} have elapsed and the route's
 * guard/resolve chain is still in flight. Defaults to
 * {@link DefaultCraftPendingComponent}.
 */
type PendingService<T> = {
  provide(value?: T | (() => T)): unknown;
  inject(): T;
};
function pendingService<T>(
  service: unknown,
  provideName: string,
  metadataName: string,
): PendingService<T> {
  const api = service as Record<string, unknown>;
  return {
    provide: api[provideName] as PendingService<T>['provide'],
    inject: (api[metadataName] as { inject(): T }).inject,
  };
}
function pendingHelper<T>(service: unknown, name: string): () => Generator<unknown, T, unknown> {
  return (service as Record<string, unknown>)[name] as () => Generator<unknown, T, unknown>;
}

const craftLoadingTextService = craftService(
  { name: 'CraftLoadingText', providedIn: 'toProvide' },
  (inputs: { $provided?: Signal<string> | (() => Signal<string>) }) => {
    if (inputs.$provided) {
      return typeof inputs.$provided === 'function'
        ? inputs.$provided()
        : inputs.$provided;
    }
    return signal(resolveLoadingTextForLocale(inject(LOCALE_ID)));
  },
);
const craftPendingComponentService = craftService(
  { name: 'CraftPendingComponent', providedIn: 'toProvide' },
  (inputs: { $provided?: CraftRouteTargetInput }) =>
    inputs.$provided ?? getDefaultCraftPendingComponent(),
);
const craftStayMsService = craftService(
  { name: 'CraftStayMs', providedIn: 'toProvide' },
  (inputs: { $provided?: number }) => inputs.$provided ?? 300,
);
const craftBlankMsService = craftService(
  { name: 'CraftBlankMs', providedIn: 'toProvide' },
  (inputs: { $provided?: number }) => inputs.$provided ?? 300,
);
const craftPendingMinMsService = craftService(
  { name: 'CraftPendingMinMs', providedIn: 'toProvide' },
  (inputs: { $provided?: number }) => inputs.$provided ?? 0,
);
const craftErrorComponentService = craftService(
  { name: 'CraftErrorComponent', providedIn: 'toProvide' },
  (inputs: { $provided?: CraftExceptionComponentDescriptor | null }) =>
    inputs.$provided ?? null,
);

const loadingText = pendingService<Signal<string>>(
  craftLoadingTextService,
  'provideCraftLoadingText',
  'CRAFT_LOADING_TEXT_META_DATA',
);
const pendingComponent = pendingService<CraftRouteTargetInput>(
  craftPendingComponentService,
  'provideCraftPendingComponent',
  'CRAFT_PENDING_COMPONENT_META_DATA',
);
const stayMs = pendingService<number>(craftStayMsService, 'provideCraftStayMs', 'CRAFT_STAY_MS_META_DATA');
const blankMs = pendingService<number>(craftBlankMsService, 'provideCraftBlankMs', 'CRAFT_BLANK_MS_META_DATA');
const pendingMinMs = pendingService<number>(craftPendingMinMsService, 'provideCraftPendingMinMs', 'CRAFT_PENDING_MIN_MS_META_DATA');
const errorComponent = pendingService<CraftExceptionComponentDescriptor | null>(
  craftErrorComponentService,
  'provideCraftErrorComponent',
  'CRAFT_ERROR_COMPONENT_META_DATA',
);

export const CraftLoadingText = pendingHelper<Signal<string>>(
  craftLoadingTextService,
  'CraftLoadingText',
);
export const CraftPendingComponent = pendingHelper<CraftRouteTargetInput>(
  craftPendingComponentService,
  'CraftPendingComponent',
);
export const CraftStayMs = pendingHelper<number>(craftStayMsService, 'CraftStayMs');
export const CraftBlankMs = pendingHelper<number>(craftBlankMsService, 'CraftBlankMs');
export const CraftPendingMinMs = pendingHelper<number>(
  craftPendingMinMsService,
  'CraftPendingMinMs',
);
export const CraftErrorComponent = pendingHelper<CraftExceptionComponentDescriptor | null>(
  craftErrorComponentService,
  'CraftErrorComponent',
);
export const ɵinjectCraftLoadingText = (): Signal<string> => loadingText.inject();
export const ɵinjectCraftPendingComponent = (): CraftRouteTargetInput => pendingComponent.inject();
export const ɵinjectCraftStayMs = (): number => stayMs.inject();
export const ɵinjectCraftBlankMs = (): number => blankMs.inject();
export const ɵinjectCraftPendingMinMs = (): number => pendingMinMs.inject();
export const ɵinjectCraftErrorComponent = (): CraftExceptionComponentDescriptor | null => errorComponent.inject();

/**
 * Phase 1 duration (ms): how long the outlet keeps the **previous page** on
 * screen after the URL commits, before blanking it. A chain that settles within
 * this window transitions straight to the target — no blank, no loader.
 * Defaults to `300`.
 */

/**
 * Phase 2 duration (ms): how long the outlet shows a **blank** surface (after
 * {@link CraftStayMs}) before showing the pending component (loader). A chain
 * that settles within this window transitions straight to the target without
 * ever flashing the loader. Defaults to `300`.
 */

/**
 * Phase 3 anti-flicker (ms): once the pending component (loader) is shown, keep
 * it visible for at least this long so a chain that settles right after the
 * loader appears does not blink it in and out. Defaults to `0` (no minimum).
 */

/**
 * The application-wide global error component, rendered by the outlet when a
 * route exception handler delegates to `globalError()`. `null` until configured
 * via {@link withErrorComponent}; the global error component reads its (typed)
 * exception with `injectCraftGlobalError()`.
 */

const CRAFT_LOADING_FEATURE = Symbol('craft-loading-feature');

/**
 * An opaque unit of pending/error configuration produced by a `with*` helper and
 * consumed by {@link provideCraftLoading}. Mirrors Angular's `provideRouter`
 * feature pattern so config reads as `provideCraftLoading(withX(), withY())`.
 */
export interface CraftLoadingFeature {
  readonly [CRAFT_LOADING_FEATURE]: true;
  readonly providers: Provider[];
  readonly routerFeatures?: readonly unknown[];
  readonly recoveryRoute?: unknown;
}

/**
 * Builds an opaque {@link CraftLoadingFeature} from a provider list. Shared with
 * sibling loading features (e.g. `withCraftViewTransitions`) so they all flow
 * through {@link provideCraftLoading} / {@link isCraftLoadingFeature}.
 */
export function craftLoadingFeature(
  providers: Provider[],
): CraftLoadingFeature {
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
  component: CraftRouteTargetInput,
): CraftLoadingFeature {
  return craftLoadingFeature([
    pendingComponent.provide(component) as Provider,
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
    loadingText.provide(factory) as Provider,
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
    providers.push(stayMs.provide(thresholds.stayMs) as Provider);
  }

  if (thresholds.blankMs !== undefined) {
    providers.push(blankMs.provide(thresholds.blankMs) as Provider);
  }

  if (thresholds.pendingMinMs !== undefined) {
    providers.push(pendingMinMs.provide(thresholds.pendingMinMs) as Provider);
  }

  return craftLoadingFeature(providers);
}

/** Register the application-wide global error component (see `globalError()`). */
export function withErrorComponent(
  component: CraftExceptionComponentDescriptor,
): CraftLoadingFeature {
  return craftLoadingFeature([
    errorComponent.provide(component) as Provider,
  ]);
}

/**
 * Configures the {@link CraftRouterOutletController} pending/error surface.
 *
 * ```ts
 * provideCraftLoading(
 *   withTransitionTimings({ stayMs: 300, blankMs: 300, pendingMinMs: 500 }),
 *   withLoadingText(() => computed(() => translate('common.loading'))),
 *   withPendingComponent(MyBrandedSpinner),
 *   // Check the functional error SFC separately through ComponentDepsOf.
 *   withErrorComponent({ component: CraftGlobalErrorComponentHost }),
 * )
 * ```
 */
export function provideCraftLoading(
  ...features: CraftLoadingFeature[]
): Provider[] {
  return [
    loadingText.provide() as Provider,
    pendingComponent.provide() as Provider,
    stayMs.provide() as Provider,
    blankMs.provide() as Provider,
    pendingMinMs.provide() as Provider,
    errorComponent.provide() as Provider,
    ...features.flatMap((feature) => feature.providers),
  ];
}
