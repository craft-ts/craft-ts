// @vitest-environment jsdom
import { mountCraftComponent } from '@craft-ts/component';
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import {
  installCraftEffectBridge,
  provideLayer,
  resolveEffectLevel,
} from '@craft-ts/effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EffectLayerScopeComponent from './effect-layer-scope';
import { SessionLive, SupportTeamLive } from '../../shared/access-domain';

describe('demo: vue d’équipe avec Layers global et route', () => {
  let disposeBridge: () => void;

  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
    disposeBridge = installCraftEffectBridge();
  });

  afterEach(() => {
    disposeBridge();
    TestBed.resetTestingModule();
  });

  it('hérite de la session globale et ajoute le contexte de route', async () => {
    const element = document.createElement('div');
    document.body.append(element);
    const globalInjector = TestBed.rootInjector.createChild([
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
    TestBed.tick();

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Équipe Support');
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
