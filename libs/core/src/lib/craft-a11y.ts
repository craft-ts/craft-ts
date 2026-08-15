import { InjectionToken } from '@angular/core';
import { TitleStrategy, type RouterStateSnapshot } from '@angular/router';
import { ɵapplyBrowserDocumentTitle } from './browser-boundaries';
import { craftLoadingFeature, type CraftLoadingFeature } from './craft-pending';
import { craftToken } from './host/craft-injector';

/**
 * When true, {@link CraftRouterOutletController} moves keyboard focus to
 * `#main` / `<main>` after a completed navigation (not the initial load).
 */
export const CRAFT_A11Y_NAVIGATION_FOCUS = new InjectionToken<boolean>(
  'CRAFT_A11Y_NAVIGATION_FOCUS',
  { providedIn: 'root', factory: () => false },
);

/**
 * Opt-in: after each in-app navigation, focus the page `<main>` so keyboard
 * and screen-reader users are not left on the previous link. Pair with a
 * skip link (`skipLink()`) and `main({ id: 'main' })`.
 */
export function withA11yNavigationFocus(): CraftLoadingFeature {
  return craftLoadingFeature([
    { provide: CRAFT_A11Y_NAVIGATION_FOCUS, useValue: true },
  ]);
}

/**
 * Binds Angular route `title` to `BrowserDocument.setTitle`. Registered by
 * default from {@link provideCraftRouter}.
 */
export type CraftTitleStrategy = TitleStrategy;

export const CRAFT_TITLE_STRATEGY =
  craftToken<CraftTitleStrategy>('CraftTitleStrategy');

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
