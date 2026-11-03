// @vitest-environment jsdom
import { mountCraftComponent } from '@craft-ts/component';
import {
  CraftTestBed,
  provideCraftRouter,
  ɵInjector as Injector,
  ɵinjectCraftRouterRuntime,
  ɵrunInInjectionContext,
} from '@craft-ts/core';
import { installCraftEffectBridge, provideLayer } from '@craft-ts/effect';
import { Layer } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { demoEffectRoutes } from './app.routes';
import { AccessPolicyLive, SessionLive } from './shared/access-domain';

/** Each example, opened from the shell the way a visitor reaches it. */
describe('Effect demo pages', () => {
  let element: HTMLElement;
  let mounted: { destroy(): void };
  let disposeBridge: () => void;

  beforeEach(() => {
    CraftTestBed.resetTestingModule();
    document.body.replaceChildren();
    disposeBridge = installCraftEffectBridge();
    // As app.config.ts provides them, without the dev tools.
    CraftTestBed.configureTestingModule({
      providers: [
        provideCraftRouter(demoEffectRoutes.toRoutes()),
        provideLayer(Layer.mergeAll(AccessPolicyLive, SessionLive)),
      ],
    });
    element = document.createElement('div');
    document.body.append(element);
    mounted = mountCraftComponent(App, element, CraftTestBed.inject(Injector));
    CraftTestBed.tick();
  });

  afterEach(() => {
    mounted.destroy();
    disposeBridge();
    CraftTestBed.resetTestingModule();
  });

  it.each([
    ['/', 'View a profile (resolved)'],
    ['/access', 'Check access rights'],
    ['/team', 'Team overview'],
    ['/playground', 'Effect Playground'],
    ['/sync-members', 'Synchronous and asynchronous members of one Effect service'],
    ['/i18n', 'Translating inside an Effect program'],
    ['/stream-interop', 'Effect streams and craft streams'],
    ['/effect-function', 'Use an Effect function with injected Database'],
  ])('opens %s', async (url, title) => {
    const router = ɵrunInInjectionContext(CraftTestBed.inject(Injector), () =>
      ɵinjectCraftRouterRuntime(),
    );
    if (!router) throw new Error('Craft router was not provided');
    void router.navigateByUrl(url);
    CraftTestBed.tick();
    await vi.waitFor(() => expect(element.textContent).toContain(title), {
      timeout: 5_000,
    });
  });
});
