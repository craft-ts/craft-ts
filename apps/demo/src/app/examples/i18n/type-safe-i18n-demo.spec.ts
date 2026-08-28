// @vitest-environment jsdom
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import { craftComponent, mountCraftComponent, p } from '@craft-ts/component';
import type {
  ComponentDepsOf,
  GetServiceDependencies,
  RouteCheckedDI,
} from '@craft-ts/core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Equal, Expect } from 'test-type';
import TypeSafeI18nDemo from './type-safe-i18n-demo';
import { I18n } from './i18n.service';
import type {
  ClientCurrency,
  DemoOrderTranslationDependencies,
} from './i18n.service';

// `page.order` formats money through `ClientCurrency` and a weight through
// `ClientUnits`; both travel with the message.
type _TranslationDependencyIsInferred = Expect<
  Equal<
    keyof DemoOrderTranslationDependencies,
    'ClientCurrency' | 'ClientUnits'
  >
>;
type _TranslationUsesClientCurrencyContract = Expect<
  Equal<
    DemoOrderTranslationDependencies['ClientCurrency'],
    GetServiceDependencies<typeof ClientCurrency>
  >
>;

const ORDER_PARAMS = {
  amount: 1234.5,
  placedAt: '2026-08-25T14:30:00Z',
  weight: 12.4,
} as const;

const _BrokenI18nDemo = craftComponent(
  'BrokenI18nDemo',
  {},
  function* () {
    return yield* I18n();
  },
  ({ translate }) => p(translate('page.order', { ...ORDER_PARAMS })),
);

type _MissingTranslationProviderIsReported = Expect<
  Equal<
    RouteCheckedDI<
      ComponentDepsOf<typeof _BrokenI18nDemo>,
      'I18n',
      never,
      'the i18n demo without its local providers'
    >,
    [
      'The ClientCurrency service is not provided in the i18n demo without its local providers',
      'The ClientUnits service is not provided in the i18n demo without its local providers',
    ]
  >
>;

// The same translation bound to an attribute must be checked the same way.
const _BrokenAttributeDemo = craftComponent(
  'BrokenAttributeDemo',
  {},
  function* () {
    return yield* I18n();
  },
  ({ translate }) =>
    p({ title: translate('page.order', { ...ORDER_PARAMS }) }, 'order'),
);

type _MissingProviderIsReportedFromAnAttribute = Expect<
  Equal<
    RouteCheckedDI<
      ComponentDepsOf<typeof _BrokenAttributeDemo>,
      'I18n',
      never,
      'an attribute binding'
    >,
    [
      'The ClientCurrency service is not provided in an attribute binding',
      'The ClientUnits service is not provided in an attribute binding',
    ]
  >
>;
type _DemoProviderSatisfiesTranslationDependency = Expect<
  Equal<RouteCheckedDI<ComponentDepsOf<typeof TypeSafeI18nDemo>, 'I18n'>, true>
>;

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
    expect(host.textContent).toContain('CHF');
    // The weight token resolves the client's unit system…
    expect(host.textContent).toContain('kg');
    // …and the date token received an ISO string that its schema parsed.
    expect(host.textContent).toContain('August 25, 2026');

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

    const client = host.querySelector<HTMLSelectElement>('#i18n-client');
    expect(client).not.toBeNull();
    if (client) {
      client.value = 'globex';
      client.dispatchEvent(new Event('change', { bubbles: true }));
    }
    TestBed.tick();

    expect(host.textContent).toContain('$US');
    expect(host.textContent).toContain('lb');
    expect(secondHost.textContent).toContain('CHF');
    expect(secondHost.textContent).toContain('kg');

    mounted.destroy();
    secondMounted.destroy();
  });
});
