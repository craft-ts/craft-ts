// @vitest-environment jsdom
// ɵ EffectTS + CraftTS demo — component behavior tests.
//
// Drives the demo page for real: mounts it, clicks each scenario button, and
// reads the DOM. This is what would otherwise be eyeballed in the browser.
import { mountCraftComponent } from '@craft-ts/component';
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import { installCraftEffectBridge } from '@craft-ts/effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EffectYieldComponent from './effect-yield';

describe('demo: consultation de profil avec Effect', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
  });

  let disposeBridge: () => void;

  beforeEach(() => {
    disposeBridge = installCraftEffectBridge();
  });

  afterEach(() => {
    disposeBridge();
  });

  const mount = () => {
    const element = document.createElement('div');
    document.body.append(element);
    const mounted = mountCraftComponent(
      EffectYieldComponent,
      element,
      TestBed.inject(Injector),
    );
    TestBed.tick();
    return { element, mounted };
  };

  const clickScenario = async (label: string, element: HTMLElement) => {
    const target = await vi.waitFor(() => {
      const match = Array.from(
        element.querySelectorAll<HTMLButtonElement>('button'),
      ).find((button) => button.textContent?.trim() === label);
      expect(match).toBeDefined();
      return match;
    });
    if (!target) {
      throw new Error(`Scenario button not found: ${label}`);
    }
    target.click();
    TestBed.tick();
  };

  it('charge le profil quand la consultation réussit', async () => {
    const { element, mounted } = mount();

    await clickScenario('Profil disponible', element);
    expect(element.textContent).toContain('Consultation en cours…');

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Ada Lovelace');
    });

    mounted.destroy();
  });

  it('affiche un profil introuvable comme erreur métier typée', async () => {
    const { element, mounted } = mount();

    await clickScenario('Profil introuvable', element);

    // The template matched on the discriminant — proof the _tag survived the
    // whole trip from the Effect error to matchBlock.
    await vi.waitFor(() => {
      expect(element.textContent).toContain('UserNotFound');
    });
    expect(element.textContent).not.toContain('Ada Lovelace');

    mounted.destroy();
  });

  it('distingue une session expirée d’un profil absent', async () => {
    const { element, mounted } = mount();

    await clickScenario('Session expirée', element);

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Unauthorized');
    });

    mounted.destroy();
  });

  it('garde une panne technique hors du canal métier', async () => {
    const { element, mounted } = mount();

    await clickScenario('Panne de base de données', element);

    await vi.waitFor(() => {
      expect(element.textContent).toContain(
        'Consulter un profil (exception)',
      );
    });
    // A defect is not a business exception: no discriminant match is rendered.
    expect(element.textContent).not.toContain('UserNotFound');

    mounted.destroy();
  });
});
