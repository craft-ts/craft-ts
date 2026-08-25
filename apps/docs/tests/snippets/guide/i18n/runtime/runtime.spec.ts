import { describe, expect, it } from 'vitest';
import { en, fr, locales } from '../catalog/order-catalog';

// #region create
import { createI18nRuntime } from '@craft-ts/i18n';

export const i18n = createI18nRuntime({
  locales,
  defaultLocale: 'en-US',
  // The time zone belongs here, once, rather than on every call site.
  timeZone: 'UTC',
});
// #endregion create

// #region translate
i18n.t('order.total', { amount: 1234.5 }); // 'Order total €1,234.50.'
i18n.setLocale('fr-FR');
i18n.t('order.items', { count: 2 }); // '2 articles sont dans la commande.'
// #endregion translate

// #region loader
import { createI18nLoader } from '@craft-ts/i18n';

// Caches by id, and — the part that matters — evicts a *failed* load, so a
// catalogue whose chunk died on a flaky network can be retried instead of
// staying permanently poisoned.
export const loader = createI18nLoader((id: string) =>
  import(`./locales/${id}.ts`).then((module) => module.locale),
);

export const runtime = createI18nRuntime({
  locales,
  defaultLocale: 'en-US',
  loader,
});
// #endregion loader

// #region reactive
import { craftService, state } from '@craft-ts/core';

type Locale = 'en-US' | 'fr-FR';

// One service owns the active locale, and `bind` turns the runtime into a
// translator that re-reads whenever that state changes. Components consume the
// service; nothing builds a local binding.
export const { I18n } = craftService(
  { name: 'I18n', providedIn: 'global' },
  function* () {
    const runtime = createI18nRuntime({ locales, defaultLocale: 'en-US' });
    const language = yield* state('language', 'en-US' as Locale, ({ set }) => ({
      setLocale: function* (next: Locale) {
        runtime.setLocale(next);
        yield* set(next);
      },
    }));

    return { language, setLocale: language.setLocale, translate: runtime.bind(language) };
  },
);
// #endregion reactive

describe('guide/i18n/runtime.md', () => {
  it('translates against the active locale', () => {
    const runtime = createI18nRuntime({ locales, defaultLocale: 'en-US' });
    expect(runtime.t('order.total', { amount: 1234.5 })).toContain('1,234.50');
    expect(runtime.t('order.items', { count: 1 })).toBe(
      '1 item is in the order.',
    );

    runtime.setLocale('fr-FR');
    expect(runtime.t('order.items', { count: 2 })).toBe(
      '2 articles sont dans la commande.',
    );
  });

  it('refuses a locale that was never loaded', () => {
    const runtime = createI18nRuntime({ locales: [en], defaultLocale: 'en-US' });
    expect(() => runtime.setLocale('en-US')).not.toThrow();
    expect(fr.id).toBe('fr-FR');
  });

  it('hands the reactive translator back as a Craft reader', () => {
    const runtime = createI18nRuntime({ locales, defaultLocale: 'en-US' });
    const translate = runtime.bind(function* () {
      return undefined;
    });
    const reader = translate('order.items', { count: 1 });
    expect(reader().next().value).toBe('1 item is in the order.');
  });
});
