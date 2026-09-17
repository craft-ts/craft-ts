import { craftService } from './craft-service';
import type { Provider } from './host/craft-compat';
import { TitleStrategy, type RouterStateSnapshot } from './host/craft-router-types';
import { ɵapplyBrowserDocumentTitle } from './browser-boundaries';
import { craftLoadingFeature, type CraftLoadingFeature } from './craft-pending';

/**
 * When true, {@link CraftRouterOutletController} moves keyboard focus to
 * `#main` / `<main>` after a completed navigation (not the initial load).
 */
const craftA11yNavigationFocusService = craftService(
  { name: 'CraftA11yNavigationFocus', providedIn: 'manuallyProvidedAtRoot' },
  (inputs: { $provided?: boolean }) => inputs.$provided ?? false,
) as unknown as {
  CraftA11yNavigationFocus: () => Generator<unknown, boolean, unknown>;
  provideCraftA11yNavigationFocus: (value: boolean) => Provider;
  CRAFT_A11Y_NAVIGATION_FOCUS_META_DATA: { inject(): boolean };
};

export const CraftA11yNavigationFocus =
  craftA11yNavigationFocusService.CraftA11yNavigationFocus;
export const provideCraftA11yNavigationFocus = (value: boolean): Provider =>
  craftA11yNavigationFocusService.provideCraftA11yNavigationFocus(value);
export const ɵinjectCraftA11yNavigationFocus = (): boolean => {
  try {
    return craftA11yNavigationFocusService.CRAFT_A11Y_NAVIGATION_FOCUS_META_DATA.inject();
  } catch {
    return false;
  }
};

/**
 * Opt-in: after each in-app navigation, focus the page `<main>` so keyboard
 * and screen-reader users are not left on the previous link. Pair with a
 * skip link (`skipLink()`) and `main({ id: 'main' })`.
 */
export function withA11yNavigationFocus(): CraftLoadingFeature {
  return craftLoadingFeature([
    provideCraftA11yNavigationFocus(true),
  ]);
}

/**
 * Binds Angular route `title` to `BrowserDocument.setTitle`. Registered by
 * default from {@link provideCraftRouter}.
 */
export type CraftTitleStrategy = TitleStrategy;

const craftTitleStrategyService = craftService(
  { name: 'CraftTitleStrategy', providedIn: 'global' },
  () => createCraftTitleStrategy(),
) as unknown as {
  CraftTitleStrategy: () => Generator<unknown, CraftTitleStrategy, unknown>;
  CRAFT_TITLE_STRATEGY_META_DATA: { inject(): CraftTitleStrategy };
};

export const CraftTitleStrategy = craftTitleStrategyService.CraftTitleStrategy;
export const ɵinjectCraftTitleStrategy = (): CraftTitleStrategy =>
  craftTitleStrategyService.CRAFT_TITLE_STRATEGY_META_DATA.inject();

export function createCraftTitleStrategy(): CraftTitleStrategy {
  return new (class extends TitleStrategy {
    override updateTitle(snapshot: RouterStateSnapshot): void {
      const title = this.buildTitle(snapshot);
      if (title !== undefined) {
        ɵapplyBrowserDocumentTitle(title);
      }
    }
  })();
}
