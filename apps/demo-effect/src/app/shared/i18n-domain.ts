/**
 * The i18n half of the demo: a catalogue, a runtime, and the Layer that hands
 * that runtime to Effect programs.
 *
 * `@craft-ts/i18n` has no Effect import — the catalogue below would work in a
 * worker or a Node test with nothing else installed. `@craft-ts/i18n-effect` is
 * the adapter, and it wraps the runtime the rest of the app already uses rather
 * than owning a second one: there is exactly one active locale in the process.
 */
import {
  createI18nRuntime,
  dateLong,
  defineCatalog,
  defineLocale,
  defineLocaleLike,
  money,
  msg,
  number,
  plural,
  type TranslationKey,
  type TranslationParams,
} from '@craft-ts/i18n';
import { provideI18nRuntime, translateEffect } from '@craft-ts/i18n-effect';
import { Effect } from 'effect';

const total = money('total', undefined, { currency: 'EUR' });
const count = number('count');
const placedAt = dateLong('placedAt');

const englishCatalog = defineCatalog({
  receipt: {
    heading: msg`Your receipt`,
    placed: msg`Placed on ${placedAt}.`,
    total: msg`Total: ${total}.`,
    lines: plural(count, {
      one: msg`${count} line on this order.`,
      other: msg`${count} lines on this order.`,
    }),
  },
});

const englishLocale = defineLocale('en-US', englishCatalog);

// Same keys, same parameters, and the plural categories French requires. A key
// missing here is a compile error, not a fallback rendered to French users.
const frenchLocale = defineLocaleLike(englishLocale, 'fr-FR', {
  receipt: {
    heading: msg`Votre reçu`,
    placed: msg`Commande passée le ${placedAt}.`,
    total: msg`Total : ${total}.`,
    lines: plural(count, {
      one: msg`${count} ligne sur cette commande.`,
      other: msg`${count} lignes sur cette commande.`,
    }),
  },
});

export const locales = [englishLocale, frenchLocale] as const;
export type ReceiptLocale = (typeof locales)[number]['id'];

export const i18nRuntime = createI18nRuntime({
  locales,
  defaultLocale: 'en-US',
  // On the runtime, once. Per call site is how two dates in one view end up in
  // two zones.
  timeZone: 'UTC',
});

/** The Layer an Effect program resolves `I18nEffectService` from. */
export const I18nLive = provideI18nRuntime(i18nRuntime);

type AppLocales = typeof locales;

/**
 * `translateEffect` has no value parameter carrying the locales, so TypeScript
 * cannot infer them: called bare, its key parameter resolves to `never` and
 * even a valid key is rejected. Bind them once, here.
 */
const t = <Key extends TranslationKey<AppLocales[number]>>(
  key: Key,
  ...params: keyof TranslationParams<
    AppLocales[number],
    Key & string
  > extends never
    ? [params?: TranslationParams<AppLocales[number], Key & string>]
    : [params: TranslationParams<AppLocales[number], Key & string>]
) => translateEffect<AppLocales, Key>(key, ...params);

export type Receipt = {
  readonly heading: string;
  readonly placed: string;
  readonly total: string;
  readonly lines: string;
};

export type Order = {
  readonly totalCents: number;
  readonly lineCount: number;
  readonly placedAt: number;
};

/**
 * An Effect program that happens to translate — which is the case
 * `translateEffect` exists for. In a component, `i18nRuntime.t` is the shorter
 * path and adds no requirement to anything.
 */
export const renderReceipt = Effect.fnUntraced(function* (order: Order) {
  return {
    heading: yield* t('receipt.heading'),
    placed: yield* t('receipt.placed', { placedAt: order.placedAt }),
    total: yield* t('receipt.total', { total: order.totalCents / 100 }),
    lines: yield* t('receipt.lines', { count: order.lineCount }),
  } satisfies Receipt;
});
