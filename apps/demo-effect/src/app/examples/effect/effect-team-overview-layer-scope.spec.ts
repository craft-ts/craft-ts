// @vitest-environment jsdom
import { mountCraftComponent } from '@craft-ts/component';
import { CraftTestBed, ɵInjector as Injector } from '@craft-ts/core';
import {
  installCraftEffectBridge,
  provideLayer,
  resolveEffectLevel,
} from '@craft-ts/effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EffectLayerScopeComponent from './effect-team-overview-layer-scope';
import { SessionLive, SupportTeamLive } from '../../shared/access-domain';

describe('demo: team overview with global and route Layers', () => {
  let disposeBridge: () => void;

  beforeEach(() => {
    CraftTestBed.resetTestingModule();
    document.body.replaceChildren();
    disposeBridge = installCraftEffectBridge();
  });

  afterEach(() => {
    disposeBridge();
    CraftTestBed.resetTestingModule();
  });

  it('inherits the global session and adds the route context', async () => {
    const element = document.createElement('div');
    document.body.append(element);
    const globalInjector = CraftTestBed.rootInjector.createChild([
      provideLayer(SessionLive),
    ]);
    // This is the same Angular-style route injector shape used by the router.
    const routeInjector = Injector.create({
      providers: [provideLayer(SupportTeamLive)],
      parent: globalInjector,
    });

    expect(resolveEffectLevel(globalInjector)).not.toBeNull();
    expect(resolveEffectLevel(routeInjector)).not.toBeNull();

    const mounted = mountCraftComponent(
      EffectLayerScopeComponent,
      element,
      routeInjector,
    );
    CraftTestBed.tick();

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Support Team');
      expect(element.textContent).toContain('Ada Lovelace');
      expect(element.textContent).toContain('Grace Hopper');
      expect(element.textContent).toContain('Linus Torvalds');
      expect(element.textContent).not.toContain('SessionLive');
      expect(element.textContent).not.toContain('SupportTeamLive');
    });

    mounted.destroy();
    routeInjector.destroy();
    globalInjector.destroy();
  });
});
