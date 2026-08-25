import { describe, expect, it } from 'vitest';
import { createI18nRuntime } from '@craft-ts/i18n';
import { locales } from '../catalog/order-catalog';

// #region layer
import { Effect } from 'effect';
import { provideI18nRuntime, translateEffect } from '@craft-ts/i18n-effect';

const runtime = createI18nRuntime({ locales, defaultLocale: 'en-US' });

// One Layer, built from the runtime the rest of the app already uses.
export const i18nLayer = provideI18nRuntime(runtime);
// #endregion layer

// #region bind
import type { TranslationKey, TranslationParams } from '@craft-ts/i18n';

type AppLocales = typeof locales;

/**
 * `translateEffect` has no value parameter carrying the locales, so TypeScript
 * cannot infer them: called bare, its key parameter resolves to `never` and
 * even a valid key is rejected. Bind them once, here, and every call site gets
 * the closed key union back.
 */
export const t = <Key extends TranslationKey<AppLocales[number]>>(
  key: Key,
  ...params: keyof TranslationParams<
    AppLocales[number],
    Key & string
  > extends never
    ? [params?: TranslationParams<AppLocales[number], Key & string>]
    : [params: TranslationParams<AppLocales[number], Key & string>]
) => translateEffect<AppLocales, Key>(key, ...params);
// #endregion bind

// #region translate
// Same keys, same params, same string as runtime.t — but as an Effect that
// declares I18nEffectService in its requirements.
const summary = Effect.gen(function* () {
  const total = yield* t('order.total', { amount: 1234.5 });
  const items = yield* t('order.items', { count: 2 });
  return `${total} ${items}`;
});
// #endregion translate

describe('guide/i18n/effect.md', () => {
  it('returns exactly what runtime.t returns', async () => {
    const result = await Effect.runPromise(
      summary.pipe(Effect.provide(i18nLayer)),
    );
    expect(result).toBe(
      `${runtime.t('order.total', { amount: 1234.5 })} ${runtime.t('order.items', { count: 2 })}`,
    );
  });
});
