import {
  TitleStrategy,
} from './host/craft-router-types';
import { TestBed } from './host/craft-test-bed';
import { beforeAll, describe, expect, it } from 'vitest';
import { isCraftLoadingFeature } from './craft-pending';
import {
  createCraftTitleStrategy,
  ɵinjectCraftA11yNavigationFocus,
  withA11yNavigationFocus,
} from './craft-a11y';
import { provideCraftRouter as provideRouter } from './craft-router';
import {
  ɵinjectCraftMatch,
  ɵinjectCraftRouterRuntime,
} from './craft-router-tokens';

class TitleProbeComponent {}

describe('craft a11y navigation', () => {
  it('exposes withA11yNavigationFocus as a loading feature', () => {
    const feature = withA11yNavigationFocus();
    expect(isCraftLoadingFeature(feature)).toBe(true);
    TestBed.configureTestingModule({ providers: [...feature.providers] });
    expect(TestBed.runInInjectionContext(() => ɵinjectCraftA11yNavigationFocus())).toBe(true);
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
    TestBed.runInInjectionContext(() => ɵinjectCraftMatch());
    const router = TestBed.runInInjectionContext(() => ɵinjectCraftRouterRuntime()!);
    await router.navigateByUrl('/hello');
    expect(document.title).toBe('Hello page');
  });
});
