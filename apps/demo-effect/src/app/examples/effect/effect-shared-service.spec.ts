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
import { AccessPolicyLive } from '../../shared/access-domain';

describe('demo: vérification de droits avec un service partagé', () => {
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

  it('résout la politique d’accès via le Layer applicatif', async () => {
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

    expect(element.textContent).toContain('Vérification en cours…');
    expect(element.textContent).not.toContain('Utilisateur inconnu.');

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Accès complet');
    });

    const grace = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Grace'),
    );
    expect(grace).toBeDefined();
    grace?.click();
    TestBed.tick();

    expect(element.textContent).toContain('Vérification en cours…');
    expect(element.textContent).not.toContain('Utilisateur inconnu.');

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Lecture seule');
    });

    mounted.destroy();
    injector.destroy();
  });
});
