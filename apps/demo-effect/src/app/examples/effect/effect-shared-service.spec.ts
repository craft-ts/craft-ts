// @vitest-environment jsdom
import { mountCraftComponent } from '@craft-ts/component';
import { TestBed } from '@craft-ts/core';
import {
  installCraftEffectBridge,
  provideLayer,
  resolveEffectLevel,
} from '@craft-ts/effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EffectSharedServiceComponent from './effect-shared-service';
import { GreetingServiceLive } from '../../shared/greeting-service';

describe('demo: Effect service from a shared file', () => {
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

  it('resolves the shared service through the application Layer', async () => {
    const element = document.createElement('div');
    document.body.append(element);
    const injector = TestBed.rootInjector.createChild([
      provideLayer(GreetingServiceLive),
    ]);
    expect(resolveEffectLevel(injector)).not.toBeNull();
    const mounted = mountCraftComponent(
      EffectSharedServiceComponent,
      element,
      injector,
    );
    TestBed.tick();

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Hello Ada');
    });

    const grace = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Grace',
    );
    expect(grace).toBeDefined();
    grace?.click();
    TestBed.tick();

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Hello Grace');
    });

    mounted.destroy();
    injector.destroy();
  });
});
