import { describe, expect, it } from 'vitest';
import { defineLocale, defineLocaleLike, msg, number, plural } from './i18n';
import {
  edgeValuesFor,
  findHardCodedText,
  flattenCatalog,
  longestLocale,
  measureLocales,
  pluralAxis,
  pseudoCatalog,
  pseudoText,
} from './visual-testing';

const count = number('count');

const en = defineLocale('en-US', {
  cart: {
    title: msg`Your cart`,
    items: plural(count, {
      one: msg`${count} item`,
      other: msg`${count} items`,
    }),
  },
  account: { settings: msg`Account settings` },
});

const de = defineLocaleLike(en, 'de-DE', {
  cart: {
    title: msg`Ihr Warenkorb`,
    items: plural(count, {
      one: msg`${count} Artikel`,
      other: msg`${count} Artikel`,
    }),
  },
  account: { settings: msg`Benutzerkontoeinstellungen` },
});

describe('flattenCatalog', () => {
  it('keys every message the way the runtime keys it', () => {
    expect(flattenCatalog(en.catalog).map((entry) => entry.key)).toEqual([
      'account.settings',
      'cart.items',
      'cart.title',
    ]);
  });

  it('keeps a plural whole, with its declared categories', () => {
    const items = flattenCatalog(en.catalog).find(
      (entry) => entry.key === 'cart.items',
    );
    expect(items?.kind).toBe('plural');
    expect(items?.categories).toEqual(['one', 'other']);
    expect(items?.tokens.map((token) => token.name)).toContain('count');
  });
});

describe('longestLocale', () => {
  it('measures rather than assumes which locale presses hardest', () => {
    const longest = longestLocale([en, de]);
    expect(longest?.id).toBe('de-DE');
    expect(longest?.longestKey).toBe('account.settings');
  });

  it('measures only the keys the screen actually uses', () => {
    // 'Your cart' beats 'Ihr Warenkorb'? No — but the point is that the answer
    // depends on the screen, which is exactly why one axis point is enough and
    // one per language is waste.
    const measured = measureLocales([en, de], ['cart.title']);
    expect(measured.map((locale) => locale.id)).toEqual(['de-DE', 'en-US']);
    expect(measured[0]?.length).toBe('Ihr Warenkorb'.length);
  });

  it('names the keys a locale is missing rather than scoring it lower', () => {
    const partial = { id: 'pt-BR', catalog: { cart: { title: msg`Carrinho` } } };
    const measured = measureLocales([partial], ['cart.title', 'account.settings']);
    expect(measured[0]?.missing).toEqual(['account.settings']);
  });
});

describe('pseudoText', () => {
  it('brackets, accents and lengthens', () => {
    const text = pseudoText('Save');
    expect(text.startsWith('[[')).toBe(true);
    expect(text.endsWith(']]')).toBe(true);
    expect(text).toContain('Šäṽé');
    expect(text.length).toBeGreaterThan('Save'.length);
  });

  it('pads with separate words, so min-content does not move', () => {
    // Gluing the padding on would fake an unbreakable word and report a column
    // as too narrow when the real translation, which has spaces, fits.
    const words = pseudoText('A label of some length').split(' ');
    expect(words.length).toBeGreaterThan('A label of some length'.split(' ').length);
    expect(Math.max(...words.map((word) => word.length))).toBeLessThan(12);
  });

  it('leaves whitespace-only text alone', () => {
    expect(pseudoText(' ')).toBe(' ');
  });
});

describe('pseudoCatalog', () => {
  it('lengthens the literals and does not touch the tokens', () => {
    const pseudo = pseudoCatalog(en.catalog);
    const title = flattenCatalog(pseudo).find((entry) => entry.key === 'cart.title');
    expect(title?.literals.join('')).toContain('[[');

    const items = flattenCatalog(pseudo).find((entry) => entry.key === 'cart.items');
    // Mangling `${count}` would break the parameter contract and the render
    // would fail for a reason that has nothing to do with layout.
    expect(items?.tokens.map((token) => token.name)).toContain('count');
    expect(items?.categories).toEqual(['one', 'other']);
  });
});

describe('findHardCodedText', () => {
  it('finds the string that never went through the catalogue', () => {
    expect(
      findHardCodedText(['[[Šäṽé ⱺⱺ]]', 'Submit', '  ', '[[Çäñçéļ ⱺ]]']),
    ).toEqual(['Submit']);
  });
});

describe('axes derived from the catalogue', () => {
  it('reads plural categories rather than enumerating them', () => {
    expect(pluralAxis(en.catalog, 'cart.items')).toEqual(['one', 'other']);
    expect(pluralAxis(en.catalog, 'cart.title')).toEqual([]);
  });

  it('derives numeric edges from a number token', () => {
    const edges = edgeValuesFor(en.catalog, ['cart.items']);
    expect(edges).toHaveLength(1);
    expect(edges[0]?.token).toBe('count');
    expect(edges[0]?.values).toContain(0);
    expect(edges[0]?.values).toContain(9_999_999);
    // A long number cannot break: it raises min-content and stops the column
    // shrinking, which is the opposite failure from a long sentence.
    expect(edges[0]?.pressure).toBe('min-content');
  });
});
