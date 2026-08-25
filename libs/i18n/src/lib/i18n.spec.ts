import { describe, expect, it } from 'vitest';
import {
  assertValidCatalog,
  createI18nLoader,
  createI18nRuntime,
  defineCatalog,
  defineLocale,
  defineLocaleLike,
  dateLong,
  money,
  msg,
  number,
  plural,
  serializeCatalog,
  validateCatalog,
} from '../index';

const count = number('count');
const amount = money('amount', undefined, { currency: 'EUR' });
const when = dateLong('when');

const en = defineLocale('en-US', defineCatalog({
  cart: {
    total: msg`Total: ${amount}.`,
    updated: msg`Updated ${when}.`,
    items: plural(count, {
      one: msg`You have ${count} item.`,
      other: msg`You have ${count} items.`,
    }),
  },
}));

const fr = defineLocaleLike(en, 'fr-FR', defineCatalog({
  cart: {
    total: msg`Total : ${amount}.`,
    updated: msg`Mis à jour ${when}.`,
    items: plural(count, {
      one: msg`Vous avez ${count} article.`,
      other: msg`Vous avez ${count} articles.`,
    }),
  },
}));

describe('@craft-ts/i18n', () => {
  it('formats tokens according to the active locale', () => {
    const runtime = createI18nRuntime({ locales: [en, fr], defaultLocale: 'en-US' });
    expect(runtime.t('cart.total', { amount: 1234.5 })).toContain('1,234.50');
    runtime.setLocale('fr-FR');
    expect(runtime.t('cart.total', { amount: 1234.5 })).toContain('1 234,50');
  });

  it('binds translation to a reactive dependency without losing key parameter types', () => {
    const runtime = createI18nRuntime({ locales: [en, fr], defaultLocale: 'en-US' });
    let reads = 0;
    const translate = runtime.bind(function* () {
      reads += 1;
    });

    const english = translate('cart.items', { count: 2 })();
    expect(english.next()).toEqual({ value: 'You have 2 items.', done: true });
    expect(reads).toBe(1);

    runtime.setLocale('fr-FR');
    const french = translate('cart.items', { count: 2 })();
    expect(french.next()).toEqual({ value: 'Vous avez 2 articles.', done: true });
    expect(reads).toBe(2);
  });

  it('selects CLDR plural categories, including fractions', () => {
    const runtime = createI18nRuntime({ locales: [en] });
    expect(runtime.t('cart.items', { count: 1 })).toBe('You have 1 item.');
    expect(runtime.t('cart.items', { count: 2 })).toBe('You have 2 items.');
    expect(runtime.t('cart.items', { count: 1.5 })).toBe('You have 1.5 items.');
  });

  it('reports incomplete strict plural catalogues', () => {
    const incomplete = defineCatalog({
      items: plural(count, { other: msg`${count}` }),
    });
    expect(validateCatalog(incomplete, 'en-US')).toEqual([
      expect.objectContaining({ code: 'MISSING_PLURAL_CATEGORY', path: 'items' }),
    ]);
    expect(() => assertValidCatalog(incomplete, 'en-US')).toThrow('plural category one');
  });

  it('does not retain a rejected locale load in cache', async () => {
    let attempts = 0;
    const loader = createI18nLoader(async (id) => {
      attempts += 1;
      if (attempts === 1) throw new Error(`Cannot load ${id}`);
      return en;
    });
    await expect(loader.load('en-US')).rejects.toThrow('Cannot load');
    await expect(loader.load('en-US')).resolves.toBe(en);
    expect(attempts).toBe(2);
  });

  it('serializes custom token references without executable formatters', () => {
    const serialized = serializeCatalog(en.catalog);
    expect(serialized.entries).toHaveProperty('cart.total.kind', 'message');
    expect(JSON.stringify(serialized)).toContain('app.money');
    expect(JSON.stringify(serialized)).not.toContain('format');
  });

  it('rejects missing and invalid values at render time', () => {
    const runtime = createI18nRuntime({ locales: [en] });
    expect(() => runtime.t('cart.total', {} as never)).toThrow('Missing parameter amount');
    expect(() => runtime.t('cart.updated', { when: new Date(Number.NaN) })).toThrow('invalid date');
  });
});
