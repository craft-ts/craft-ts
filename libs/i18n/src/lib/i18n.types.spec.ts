/**
 * The four guarantees `@craft-ts/i18n` advertises, proved at the type level.
 *
 * They are all compile-time claims, so a runtime assertion cannot check them:
 * every one of them is a `@ts-expect-error` that must stay red, plus an
 * `Expect<Equal<…>>` pinning the type it produces when it is green.
 *
 * This file is only meaningful under
 * `npx tsc -p libs/i18n/tsconfig.spec.json --noEmit`, which is what
 * `nx run craft-ts-i18n:typecheck-spec` runs. Vitest erases types; it would
 * report every fixture below as passing whatever the compiler thought.
 *
 * Falsifiability: each `@ts-expect-error` was confirmed to turn into an
 * "Unused '@ts-expect-error' directive" when the guarantee it names is removed.
 */
import { describe, expect, it } from 'vitest';
import type { Equal, Expect } from 'test-type';
import {
  createI18nRuntime,
  defineCatalog,
  defineLocale,
  defineLocaleLike,
  money,
  msg,
  number,
  plural,
  type TranslationKey,
  type TranslationParams,
} from '../index';

const count = number('count');
const amount = money('amount', undefined, { currency: 'EUR' });

const enCatalog = defineCatalog({
  order: {
    total: msg`Order total ${amount}.`,
    heading: msg`Your order`,
    items: plural(count, {
      one: msg`${count} item is in the order.`,
      other: msg`${count} items are in the order.`,
    }),
  },
});

const en = defineLocale('en-US', enCatalog);
const fr = defineLocaleLike(en, 'fr-FR', {
  order: {
    total: msg`Total de la commande : ${amount}.`,
    heading: msg`Votre commande`,
    items: plural(count, {
      one: msg`${count} article est dans la commande.`,
      other: msg`${count} articles sont dans la commande.`,
    }),
  },
});

const locales = [en, fr] as const;
const runtime = createI18nRuntime({ locales, defaultLocale: 'en-US' });

// ─── 1. the key set is a closed union ───────────────────────────────────────

type Keys = TranslationKey<(typeof locales)[number]>;
type _KeysAreClosed = Expect<
  Equal<Keys, 'order.total' | 'order.heading' | 'order.items'>
>;

/**
 * Never called.
 *
 * Every fixture below is a compile-time claim, and several of them would throw
 * at run time if they executed — `defineLocale` validates, `t` rejects an
 * unknown key. Keeping them inside a function nobody calls is what lets the
 * same file be both a `tsc` fixture and a Vitest module.
 */
export function _typeFixtures(): void {
  // @ts-expect-error 'order.totl' is not a key of the catalogue
  runtime.t('order.totl', { amount: 1 });

  // @ts-expect-error a group is not a message; only leaves are keys
  runtime.t('order');

  // ─── 2. parameters are typed by their token ─────────────────────────────────

  type TotalParams = TranslationParams<(typeof locales)[number], 'order.total'>;
  type _TotalParamsAreTyped = Expect<Equal<TotalParams, { amount: number }>>;

  // @ts-expect-error a currency amount is a number, not a Date
  runtime.t('order.total', { amount: new Date() });

  // @ts-expect-error the parameter is named by its token; 'total' is not it
  runtime.t('order.total', { total: 1234.5 });

  // @ts-expect-error a message with parameters cannot be called without them
  runtime.t('order.total');

  // ─── 3. a locale must have the same keys and the same parameters ────────────

  defineLocaleLike(en, 'fr-FR', {
    // @ts-expect-error 'order.heading' is missing, so the catalogue is not
    // compatible with the reference locale
    order: {
      total: msg`Total de la commande : ${amount}.`,
      items: plural(count, {
        one: msg`${count} article est dans la commande.`,
        other: msg`${count} articles sont dans la commande.`,
      }),
    },
  });

  defineLocaleLike(en, 'fr-FR', {
    order: {
      // @ts-expect-error the reference message has no parameter of this name
      total: msg`Total de la commande : ${count}.`,
      heading: msg`Votre commande`,
      items: plural(count, {
        one: msg`${count} article est dans la commande.`,
        other: msg`${count} articles sont dans la commande.`,
      }),
    },
  });

  // ─── 4. a plural must carry every category its locale requires ──────────────

  // French needs `one` and `other`; both are there.
  defineLocale('fr-FR', {
    items: plural(count, {
      one: msg`${count} article.`,
      other: msg`${count} articles.`,
    }),
  });

  defineLocale('pl-PL', {
    // @ts-expect-error Polish also requires 'few' and 'many'
    items: plural(count, {
      one: msg`${count} pozycja.`,
      other: msg`${count} pozycji.`,
    }),
  });
}

describe('the i18n contract, at the type level', () => {
  it('is proved by the compiler, not by this assertion', () => {
    // The four fixtures above are the test. This keeps the file a valid Vitest
    // module so it runs in the same suite, and pins the runtime side of the
    // key set at the same time.
    expect(runtime.t('order.heading')).toBe('Your order');
    expect(runtime.t('order.items', { count: 1 })).toBe(
      '1 item is in the order.',
    );
    expect(fr.id).toBe('fr-FR');
  });

  it('refuses an incomplete plural at runtime as well', () => {
    expect(() =>
      defineLocale('pl-PL', {
        items: plural(count, {
          one: msg`${count} pozycja.`,
          other: msg`${count} pozycji.`,
        }),
      } as never),
    ).toThrow('plural category');
  });
});
