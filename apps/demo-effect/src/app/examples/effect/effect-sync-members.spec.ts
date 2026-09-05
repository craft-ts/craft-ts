// @vitest-environment jsdom
import { mountCraftComponent } from '@craft-ts/component';
import { TestBed } from '@craft-ts/core';
import { installCraftEffectBridge, provideLayer } from '@craft-ts/effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EffectSyncMembersComponent from './effect-sync-members';
import { CartPricingLive } from './effect-pricing-domain';

describe('demo: synchronous and asynchronous members of one Effect service', () => {
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

  const mount = () => {
    const element = document.createElement('div');
    document.body.append(element);
    const injector = TestBed.rootInjector.createChild([
      provideLayer(CartPricingLive),
    ]);
    const mounted = mountCraftComponent(
      EffectSyncMembersComponent,
      element,
      injector,
    );
    TestBed.tick();
    return { element, injector, mounted };
  };

  const clickByName = (element: HTMLElement, name: string) => {
    const target = element.querySelector<HTMLButtonElement>(
      `[data-craft-name="${name}"]`,
    );
    if (!target) throw new Error(`No interactive element named "${name}".`);
    target.click();
    TestBed.tick();
  };

  it('renders the total on the very first tick — no await', () => {
    const { element, injector, mounted } = mount();

    // 2 × (14.50 + 29.00) = 87.00, above the promo threshold → 78.30.
    expect(element.textContent).toContain('78,30');

    mounted.destroy();
    injector.destroy();
  });

  it('recomputes the total synchronously when the quantity changes', () => {
    const { element, injector, mounted } = mount();

    clickByName(element, 'increaseQty');

    // No waitFor: a craftComputed running declared-synchronous members must
    // settle on the same tick as the click. 3 × 43.50 = 130.50 → 117.45.
    expect(element.textContent).toContain('117,45');

    mounted.destroy();
    injector.destroy();
  });

  it('runs methodEffect from an interactive action', () => {
    const { element, injector, mounted } = mount();

    clickByName(element, 'increaseQty');
    clickByName(element, 'formatCurrentCart');

    expect(element.textContent).toContain('117,45');

    mounted.destroy();
    injector.destroy();
  });

  it('keeps the suspending member behind the loader', async () => {
    const { element, injector, mounted } = mount();

    expect(element.textContent).toContain('Asking the carrier…');
    expect(element.querySelector('[role="status"] .shipping-spinner')).not.toBeNull();

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Craft Express');
      expect(element.textContent).toContain('7.30');
    });

    mounted.destroy();
    injector.destroy();
  });
});
