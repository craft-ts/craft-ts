// @vitest-environment jsdom
import { mountCraftComponent } from '@craft-ts/component';
import { TestBed } from '@craft-ts/core';
import {
  installCraftEffectBridge,
  provideLayer,
} from '@craft-ts/effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EffectFunctionComponent from './effect-function';
import { InMemoryDatabaseLive } from './effect-database';

describe('demo: using an Effect function with an injected Database', () => {
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

  it('shows pending state and renders the typed database failure', async () => {
    const element = document.createElement('div');
    document.body.append(element);

    const injector = TestBed.rootInjector.createChild([
      provideLayer(InMemoryDatabaseLive),
    ]);

    const mounted = mountCraftComponent(
      EffectFunctionComponent,
      element,
      injector,
    );
    TestBed.tick();

    expect(element.textContent).toContain(
      'Connecting to the in-memory database…',
    );

    await vi.waitFor(() => {
      expect(element.textContent).toContain(
        'DatabaseConnectionError: the in-memory connection failed.',
      );
    });

    mounted.destroy();
    injector.destroy();
  });
});
