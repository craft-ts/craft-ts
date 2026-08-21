// @vitest-environment jsdom
import { mountCraftComponent } from '@craft-ts/component';
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import { installCraftEffectBridge } from '@craft-ts/effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EffectFunctionComponent from './effect-function';

describe('demo: using a function from Effect', () => {
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

  it('runs a plain Effect program inside a Craft query', async () => {
    const element = document.createElement('div');
    document.body.append(element);

    const mounted = mountCraftComponent(
      EffectFunctionComponent,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Effect function → Craft component');
    });

    mounted.destroy();
  });
});
