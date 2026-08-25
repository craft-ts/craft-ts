import { describe, expect, it } from 'vitest';
import {
  createI18nRuntime,
  defineCatalog,
  defineLocale,
  defineLocaleLike,
  I18nRuntimeError,
  money,
  msg,
  number,
  plural,
  type TranslationKey,
  type TranslationParams,
} from '@craft-ts/i18n';
import { Effect } from 'effect';
import { I18nEffectService, provideI18nRuntime, translateEffect } from '../index';

const count = number('count');
const amount = money('amount', undefined, { currency: 'EUR' });

const en = defineLocale(
  'en-US',
  defineCatalog({
    order: {
      heading: msg`Your order`,
      total: msg`Order total ${amount}.`,
      items: plural(count, {
        one: msg`${count} item is in the order.`,
        other: msg`${count} items are in the order.`,
      }),
    },
  }),
);

const fr = defineLocaleLike(en, 'fr-FR', {
  order: {
    heading: msg`Votre commande`,
    total: msg`Total de la commande : ${amount}.`,
    items: plural(count, {
      one: msg`${count} article est dans la commande.`,
      other: msg`${count} articles sont dans la commande.`,
    }),
  },
});

const locales = [en, fr] as const;
type Locales = typeof locales;

/**
 * `translateEffect` has no value parameter carrying the locales, so nothing
 * lets TypeScript infer them: called bare, `Key` widens to its constraint and
 * the key parameter resolves to `never` — even a valid key is rejected. Binding
 * them once is the documented way round it, and this wrapper is the same one
 * `/guide/i18n/effect` shows.
 */
const t = <Key extends TranslationKey<Locales[number]>>(
  key: Key,
  ...params: keyof TranslationParams<Locales[number], Key & string> extends never
    ? [params?: TranslationParams<Locales[number], Key & string>]
    : [params: TranslationParams<Locales[number], Key & string>]
) => translateEffect<Locales, Key>(key, ...params);

const runtimeWith = () => createI18nRuntime({ locales, defaultLocale: 'en-US' });

describe('@craft-ts/i18n-effect', () => {
  it('provides the plain i18n runtime through an Effect layer', () => {
    const runtime = runtimeWith();
    const result = Effect.runSync(
      Effect.provide(t('order.items', { count: 2 }), provideI18nRuntime(runtime)),
    );
    expect(result).toBe('2 items are in the order.');
  });

  it('returns exactly what runtime.t returns, for every key and locale', () => {
    const runtime = runtimeWith();
    const layer = provideI18nRuntime(runtime);
    const cases = [
      ['order.heading', undefined],
      ['order.total', { amount: 1234.5 }],
      ['order.items', { count: 1 }],
      ['order.items', { count: 7 }],
    ] as const;

    for (const locale of ['en-US', 'fr-FR'] as const) {
      runtime.setLocale(locale);
      for (const [key, params] of cases) {
        const viaEffect = Effect.runSync(
          Effect.provide(t(key as never, params as never), layer),
        );
        expect(viaEffect).toBe(runtime.t(key as never, params as never));
      }
    }
  });

  it('reads the same active locale as the runtime, not a copy of it', () => {
    const runtime = runtimeWith();
    const layer = provideI18nRuntime(runtime);
    const heading = () =>
      Effect.runSync(Effect.provide(t('order.heading'), layer));

    expect(heading()).toBe('Your order');
    // Switched on the plain runtime; the Effect side must follow.
    runtime.setLocale('fr-FR');
    expect(heading()).toBe('Votre commande');
  });

  it('exposes the runtime on the service, so a program can read the locale', () => {
    const runtime = runtimeWith();
    const active = Effect.runSync(
      Effect.provide(
        Effect.gen(function* () {
          return (yield* I18nEffectService).runtime.locale();
        }),
        provideI18nRuntime(runtime),
      ),
    );
    expect(active).toBe('en-US');
  });

  it('surfaces LOCALE_NOT_LOADED rather than translating into the wrong language', () => {
    // `setLocale` guards the id it is given, so reaching an unloaded locale
    // takes a cast — which is exactly the case this error exists for.
    const runtime = createI18nRuntime({ locales: [en], defaultLocale: 'en-US' });

    expect(() => runtime.setLocale('fr-FR' as never)).toThrowError(
      expect.objectContaining({ code: 'LOCALE_NOT_LOADED' }),
    );
    // Still English: a refused switch must not leave the runtime in between.
    expect(runtime.t('order.heading')).toBe('Your order');

    // Without a loader there is nothing to load it from, and the same error
    // says so instead of silently doing nothing.
    return expect(runtime.loadLocale('fr-FR' as never)).rejects.toBeInstanceOf(
      I18nRuntimeError,
    );
  });

  it('carries a failure out of the Effect rather than swallowing it', () => {
    const runtime = createI18nRuntime({ locales: [en], defaultLocale: 'en-US' });
    // The error channel of translateEffect is `never`: a bad key or a bad
    // parameter cannot compile. A locale that is not loaded is a defect, and
    // it surfaces as a defect.
    const exit = Effect.runSyncExit(
      Effect.provide(
        translateEffect<readonly [typeof en], 'order.heading'>('order.heading'),
        provideI18nRuntime({
          ...runtime,
          translate: (() => {
            throw new I18nRuntimeError('LOCALE_NOT_LOADED', 'not loaded');
          }) as typeof runtime.translate,
          t: (() => {
            throw new I18nRuntimeError('LOCALE_NOT_LOADED', 'not loaded');
          }) as typeof runtime.t,
        }),
      ),
    );

    expect(exit._tag).toBe('Failure');
  });
});
