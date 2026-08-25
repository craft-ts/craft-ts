// @vitest-environment jsdom
import { mountCraftComponent } from '@craft-ts/component';
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import { installCraftEffectBridge, provideLayer } from '@craft-ts/effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EffectPlaygroundComponent from './effect-playground';
import { TodoStoreLive } from './effect-playground-domain';

describe('demo: Effect playground', () => {
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

  it('loads and adds a todo through Effect resources', async () => {
    const element = document.createElement('div');
    document.body.append(element);
    const injector = TestBed.rootInjector.createChild([
      provideLayer(TodoStoreLive),
    ]);
    const mounted = mountCraftComponent(
      EffectPlaygroundComponent,
      element,
      injector as unknown as Injector,
    );
    TestBed.tick();

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Learn @craft-ts/effect');
    });

    const title = element.querySelector<HTMLInputElement>(
      '[data-craft-name="title"]',
    );
    const add = element.querySelector<HTMLButtonElement>(
      '[data-craft-name="add"]',
    );
    expect(title).not.toBeNull();
    expect(add).not.toBeNull();

    title!.value = 'Try mutationEffect';
    title!.dispatchEvent(new Event('input', { bubbles: true }));
    TestBed.tick();
    add!.click();
    TestBed.tick();

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Try mutationEffect');
    });

    mounted.destroy();
    injector.destroy();
  });
});
