// @vitest-environment jsdom
import { mountCraftComponent } from '@craft-ts/component';
import { CraftTestBed } from '@craft-ts/core';
import {
  installCraftEffectBridge,
  provideLayer,
} from '@craft-ts/effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import QuickstartTaskPage from './task-page';
import { TaskRepositoryLive } from './task-domain';

describe('quickstart Effect boundary', () => {
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

  it('renders the domain result through queryEffect', async () => {
    const element = document.createElement('div');
    document.body.append(element);
    const injector = CraftTestBed.rootInjector.createChild([
      provideLayer(TaskRepositoryLive),
    ]);
    const mounted = mountCraftComponent(
      QuickstartTaskPage,
      element,
      injector,
    );
    CraftTestBed.tick();

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Understand the Effect boundary');
    });

    mounted.destroy();
    injector.destroy();
  });
});
