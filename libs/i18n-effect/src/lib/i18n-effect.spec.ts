import { describe, expect, it } from 'vitest';
import { createI18nRuntime, defineLocale, msg, number } from '@craft-ts/i18n';
import { Effect } from 'effect';
import { provideI18nRuntime, translateEffect } from '../index';

const count = number('count');
const locale = defineLocale('en-US', { count: msg`Count: ${count}` });
const runtime = createI18nRuntime({ locales: [locale] });

describe('@craft-ts/i18n-effect', () => {
  it('provides the plain i18n runtime through an Effect layer', () => {
    const result = Effect.runSync(Effect.provide(translateEffect('count', { count: 2 }), provideI18nRuntime(runtime)));
    expect(result).toBe('Count: 2');
  });
});
