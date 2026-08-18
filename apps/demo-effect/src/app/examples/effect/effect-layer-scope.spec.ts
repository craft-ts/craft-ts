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
import {
  GlobalLayer,
  RouteLayer,
} from '../../shared/layer-scope-services';

describe('demo: global and route-scoped Effect Layers', () => {
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

  it('inherits the global Layer and adds the route Layer', async () => {
    const element = document.createElement('div');
    document.body.append(element);
    const globalInjector = TestBed.rootInjector.createChild([
      provideLayer(GlobalLayer),
    ]);
    // This is the same Angular-style route injector shape used by the router.
    const routeInjector = Injector.create({
      providers: [provideLayer(RouteLayer)],
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
      expect(element.textContent).toContain('Global layer from app.config.ts');
      expect(element.textContent).toContain('Route layer from route providers');
    });

    mounted.destroy();
    routeInjector.destroy();
    globalInjector.destroy();
  });
});
