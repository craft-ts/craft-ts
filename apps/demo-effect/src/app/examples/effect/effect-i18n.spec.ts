// @vitest-environment jsdom
import { mountCraftComponent } from '@craft-ts/component';
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import { installCraftEffectBridge, provideLayer } from '@craft-ts/effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EffectI18nComponent from './effect-i18n';
import { I18nLive, i18nRuntime, renderReceipt } from '../../shared/i18n-domain';

const ORDER = {
  totalCents: 128_450,
  lineCount: 3,
  placedAt: Date.UTC(2026, 7, 25, 14, 30),
} as const;

describe('demo: translating inside an Effect program', () => {
  let disposeBridge: () => void;

  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
    i18nRuntime.setLocale('en-US');
    disposeBridge = installCraftEffectBridge();
  });

  afterEach(() => {
    disposeBridge();
    i18nRuntime.setLocale('en-US');
    TestBed.resetTestingModule();
  });

  it('renders the receipt and switches every string with the locale', async () => {
    const element = document.createElement('div');
    document.body.append(element);
    const routeInjector = Injector.create({
      providers: [provideLayer(I18nLive)],
      parent: TestBed.rootInjector,
    });

    const mounted = mountCraftComponent(
      EffectI18nComponent,
      element,
      routeInjector,
    );
    TestBed.tick();

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Your receipt');
      expect(element.textContent).toContain('3 lines on this order.');
    });

    element
      .querySelector<HTMLButtonElement>('button[aria-pressed="false"]')
      ?.click();
    TestBed.tick();

    await vi.waitFor(() => {
      expect(element.textContent).toContain('Votre reçu');
      expect(element.textContent).toContain('3 lignes sur cette commande.');
    });

    mounted.destroy();
    routeInjector.destroy();
  });

  it('returns exactly what the framework-independent runtime returns', async () => {
    const { Effect } = await import('effect');
    const receipt = await Effect.runPromise(
      renderReceipt(ORDER).pipe(Effect.provide(I18nLive)),
    );

    expect(receipt.heading).toBe(i18nRuntime.t('receipt.heading'));
    expect(receipt.lines).toBe(
      i18nRuntime.t('receipt.lines', { count: ORDER.lineCount }),
    );
    expect(receipt.total).toBe(
      i18nRuntime.t('receipt.total', { total: ORDER.totalCents / 100 }),
    );
  });
});
