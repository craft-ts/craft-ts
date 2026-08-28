import { describe, expect, it } from 'vitest';
import {
  assertValidCatalog,
  createI18nLoader,
  createI18nRuntime,
  defineCatalog,
  defineLocale,
  defineLocaleLike,
  defineToken,
  dateLong,
  money,
  msg,
  number,
  plural,
  serializeCatalog,
  validateCatalog,
  type TokenSchema,
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

/** A Standard Schema, hand-rolled the way the core specs do it. */
const isoDateSchema = {
  '~standard': {
    version: 1,
    vendor: 'test',
    types: undefined,
    validate(value: unknown) {
      if (typeof value !== 'string') return { issues: [{ message: 'string expected' }] };
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime())
        ? { issues: [{ message: 'ISO date expected' }] }
        : { value: parsed };
    },
  },
} as unknown as TokenSchema<Date, string>;

describe('@craft-ts/i18n', () => {
  it('resolves a generator-backed token in the CraftTS translator', () => {
    // A resolver that yields a request needs an injection context…
    const resolvedAmount = money('resolvedAmount', function* () {
      const currency = (yield 'currency-request') as string;
      return { currency, minimumFractionDigits: 2 };
    });
    const locale = defineLocale('en-US', {
      cart: msg`Total: ${resolvedAmount}.`,
    });
    const runtime = createI18nRuntime({ locales: [locale] });
    const translate = runtime.bind(function* () { return; });

    const reader = translate('cart', { resolvedAmount: 1234.5 })();
    expect(reader.next().value).toBe('currency-request');
    expect(reader.next('CHF')).toEqual({
      value: 'Total: CHF\u00a01,234.50.',
      done: true,
    });

    // …and `t`, which has none, says so instead of formatting the wrong money.
    // (This resolver yields a plain marker rather than a service request, so it
    // is only the runtime boundary that rejects it here; the compile-time one
    // is asserted in `i18n.types.spec.ts`, where the yield is a real request.)
    expect(() => runtime.t('cart', { resolvedAmount: 1234.5 })).toThrow(
      'must be rendered through a CraftTS translator',
    );
  });

  it('renders a dependency-free resolver through the synchronous path', () => {
    // Nothing is yielded, so the type keeps the key in `t` and `t` honours it.
    const resolvedAmount = money('resolvedAmount', function* () {
      return { currency: 'CHF', minimumFractionDigits: 2 };
    });
    const locale = defineLocale('en-US', {
      cart: msg`Total: ${resolvedAmount}.`,
    });
    const runtime = createI18nRuntime({ locales: [locale] });

    expect(runtime.t('cart', { resolvedAmount: 1234.5 })).toBe(
      'Total: CHF\u00a01,234.50.',
    );
  });

  it('parses a parameter through its schema before formatting it', () => {
    const placedAt = dateLong('placedAt', isoDateSchema);
    const locale = defineLocale('en-US', { order: msg`Placed on ${placedAt}.` });
    const runtime = createI18nRuntime({ locales: [locale] });

    // The call site passes the schema's input; the formatter gets its output.
    expect(runtime.t('order', { placedAt: '2026-08-25T12:00:00Z' })).toBe(
      'Placed on August 25, 2026.',
    );
    expect(() =>
      // @ts-expect-error The parameter type is the schema input, not `unknown`.
      runtime.t('order', { placedAt: 12 }),
    ).toThrow('Invalid parameter placedAt');
    expect(() => runtime.t('order', { placedAt: 'not a date' })).toThrow(
      'Invalid parameter placedAt: ISO date expected',
    );
  });

  it('formats through the resolver alone, with no standalone formatter', () => {
    // Both renderers take `resolveFormatter` first, so a token that has one
    // declares no `format` at all rather than a branch that never runs.
    const weight = defineToken({
      name: 'weight',
      kind: 'weight',
      resolveFormatter: function* () {
        const unit = (yield 'unit-request') as string;
        return (value: number) => `${value} ${unit}`;
      },
    });
    const locale = defineLocale('en-US', { line: msg`Weight: ${weight}.` });
    const runtime = createI18nRuntime({ locales: [locale] });
    const translate = runtime.bind(function* () { return; });

    const reader = translate('line', { weight: 12 })();
    expect(reader.next().value).toBe('unit-request');
    expect(reader.next('kg')).toEqual({ value: 'Weight: 12 kg.', done: true });
  });

  it('refuses a zero-argument function where a guard or a generator belongs', () => {
    // An arrow that *returns* a generator satisfies the DI overload at the type
    // level but is not a generator function: accepting it would install it as
    // the value guard and quietly format with the default currency.
    function* currencyOptions() {
      return { currency: 'CHF' };
    }

    expect(() => money('amount', () => currencyOptions())).toThrow(
      'zero-argument function',
    );
  });

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
