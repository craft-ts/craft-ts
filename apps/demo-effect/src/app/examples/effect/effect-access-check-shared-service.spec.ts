// @vitest-environment jsdom
import { mountCraftComponent } from '@craft-ts/component';
import { TestBed } from '@craft-ts/core';
import {
  installCraftEffectBridge,
  provideLayer,
  resolveEffectLevel,
} from '@craft-ts/effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EffectSharedServiceComponent from './effect-access-check-shared-service';
import { AccessPolicyLive } from '../../shared/access-domain';

describe('demo: checking access rights with a shared service', () => {
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

  it('resolves the access policy via the application Layer', async () => {
    const element = document.createElement('div');
    document.body.append(element);
    const injector = TestBed.rootInjector.createChild([
      provideLayer(AccessPolicyLive),
    ]);
    expect(resolveEffectLevel(injector)).not.toBeNull();
    const mounted = mountCraftComponent(
      EffectSharedServiceComponent,
      element,
      injector,
    );
    TestBed.tick();

    expect(element.textContent).toContain('Checking access…');
    expect(element.textContent).not.toContain('Unknown user.');

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Full access');
    });

    const grace = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Grace'),
    );
    expect(grace).toBeDefined();
    grace?.click();
    TestBed.tick();

    expect(element.textContent).toContain('Checking access…');
    expect(element.textContent).not.toContain('Unknown user.');

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Read only');
    });

    const linus = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Linus'),
    );
    expect(linus).toBeDefined();
    linus?.click();
    TestBed.tick();

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Linus Torvalds');
      expect(element.textContent).toContain('Access blocked');
    });

    mounted.destroy();
    injector.destroy();
  });
});
