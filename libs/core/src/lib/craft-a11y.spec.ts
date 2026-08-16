import {
  TitleStrategy,
} from './host/craft-router-types';
import { provideCraftRouter as provideRouter } from './craft-router';

/**
 * A stand-in DI token. These specs never drove a real router — they only
 * needed some external service to adapt through `toCraftService`.
 */
class Router {
  readonly url: string = '/';
  navigateByUrl(_url: string): Promise<boolean> {
    return Promise.resolve(true);
  }
}
import { TestBed } from './host/craft-test-bed';
import { beforeAll, describe, expect, it } from 'vitest';
import { isCraftLoadingFeature } from './craft-pending';
import {
  CRAFT_A11Y_NAVIGATION_FOCUS,
  createCraftTitleStrategy,
  withA11yNavigationFocus,
} from './craft-a11y';

class TitleProbeComponent {}

describe('craft a11y navigation', () => {
  it('exposes withA11yNavigationFocus as a loading feature', () => {
    const feature = withA11yNavigationFocus();
    expect(isCraftLoadingFeature(feature)).toBe(true);
    expect(
      feature.providers.some(
        (provider) =>
          typeof provider === 'object' &&
          provider !== null &&
          'provide' in provider &&
          provider.provide === CRAFT_A11Y_NAVIGATION_FOCUS,
      ),
    ).toBe(true);
  });

  it('writes the Angular route title through BrowserDocument', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'hello',
            title: 'Hello page',
            component: TitleProbeComponent,
          },
        ]),
        { provide: TitleStrategy, useFactory: createCraftTitleStrategy },
      ],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/hello');
    expect(document.title).toBe('Hello page');
  });
});
