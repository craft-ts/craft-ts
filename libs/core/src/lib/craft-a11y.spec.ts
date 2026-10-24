import {
  CraftTitleStrategy,
} from './host/craft-router-model';
import { CraftTestBed } from './host/craft-test-bed';
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
    CraftTestBed.configureTestingModule({ providers: [...feature.providers] });
    expect(CraftTestBed.runInInjectionContext(() => ɵinjectCraftA11yNavigationFocus())).toBe(true);
  });

  it('writes the Angular route title through BrowserDocument', async () => {
    CraftTestBed.resetTestingModule();
    CraftTestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'hello',
            title: 'Hello page',
            component: TitleProbeComponent,
          },
        ]),
        { provide: CraftTitleStrategy, useFactory: createCraftTitleStrategy },
      ],
    });
    CraftTestBed.runInInjectionContext(() => ɵinjectCraftMatch());
    const router = CraftTestBed.runInInjectionContext(() => ɵinjectCraftRouterRuntime()!);
    await router.navigateByUrl('/hello');
    expect(document.title).toBe('Hello page');
  });
});
