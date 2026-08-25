// @vitest-environment jsdom
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import { mountCraftComponent } from '@craft-ts/component';
import { beforeEach, describe, expect, it } from 'vitest';
import TypeSafeI18nDemo from './type-safe-i18n-demo';

describe('TypeSafeI18nDemo', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
    document.documentElement.lang = '';
  });

  it('switches every translated value and updates the document language', () => {
    const host = document.createElement('div');
    const secondHost = document.createElement('div');
    document.body.append(host, secondHost);
    const mounted = mountCraftComponent(
      TypeSafeI18nDemo,
      host,
      TestBed.inject(Injector),
    );
    const secondMounted = mountCraftComponent(
      TypeSafeI18nDemo,
      secondHost,
      TestBed.inject(Injector),
    );
    TestBed.tick();

    expect(host.textContent).toContain('Type-safe i18n playground');
    expect(host.textContent).toContain('1.5 items are in the order.');

    const language = host.querySelector<HTMLSelectElement>('#i18n-language');
    expect(language).not.toBeNull();
    if (language) {
      language.value = 'fr-FR';
      language.dispatchEvent(new Event('change', { bubbles: true }));
    }
    TestBed.tick();

    expect(host.textContent).toContain('Démonstration de l’i18n typée');
    expect(secondHost.textContent).toContain('Démonstration de l’i18n typée');
    expect(host.textContent).toContain('1,5 article est dans la commande.');
    expect(host.textContent).toContain('Payée');
    expect(document.documentElement.lang).toBe('fr-FR');

    mounted.destroy();
    secondMounted.destroy();
  });
});
