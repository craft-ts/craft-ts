import { expect, expectTypeOf, it } from 'vitest';
import { pluralCategoriesByLocale } from './plural-categories';
import type { RequiredPluralCategories } from './i18n';
import {
  createI18nRuntime,
  defineLocale,
  defineLocaleLike,
  integer,
  msg,
  plural,
  validateCatalog,
} from './i18n';
const count = integer('count');
it('validates French many at definition time (#24)', () => {
  const catalog = {
    n: plural(count, {
      one: msg`${count} élément`,
      other: msg`${count} éléments`,
    }),
  };
  expect(validateCatalog(catalog, 'fr').map((d) => d.code)).toContain(
    'MISSING_PLURAL_CATEGORY',
  );
});
it('allows Chinese plurals to use only other against an English reference (#24)', () => {
  const en = defineLocale('en', {
    n: plural(count, { one: msg`${count} item`, other: msg`${count} items` }),
  });
  const zh = defineLocaleLike(en, 'zh', {
    n: plural(count, { other: msg`${count} 个` }),
  });
  expect(createI18nRuntime({ locales: [zh] }).t('n', { count: 2 })).toBe(
    '2 个',
  );
});

it.each(['fr', 'es', 'it', 'pt'])(
  'renders the CLDR many branch for %s',
  (locale) => {
    const definition = defineLocale(locale, {
      n: plural(count, {
        one: msg`${count} one`,
        many: msg`${count} many`,
        other: msg`${count} other`,
      }),
    });
    const runtime = createI18nRuntime({ locales: [definition] });
    expect(runtime.t('n', { count: 1_000_000 })).toBe(
      `${new Intl.NumberFormat(locale).format(1_000_000)} many`,
    );
  },
);

it.each(['zh', 'ja', 'ko'])('accepts only other for %s', (locale) => {
  expect(
    validateCatalog(
      { n: plural(count, { other: msg`${count} items` }) },
      locale,
    ),
  ).toEqual([]);
});

// These are compile-time contracts; tsc verifies the expected errors too.
function _verifyCatalogueTypes(): void {
  defineLocale('fr', {
    // @ts-expect-error French requires the many category.
    n: plural(count, { one: msg`${count} item`, other: msg`${count} items` }),
  });
  defineLocale('zh', { n: plural(count, { other: msg`${count} items` }) });
  defineLocale('ja', { n: plural(count, { other: msg`${count} items` }) });
  defineLocale('ko', { n: plural(count, { other: msg`${count} items` }) });
}

it('matches the generated CLDR categories with Intl for supported locales', () => {
  for (const [locale, expected] of Object.entries(pluralCategoriesByLocale)) {
    if (Intl.PluralRules.supportedLocalesOf([locale]).length === 0) continue;
    expect(
      [
        ...new Intl.PluralRules(locale).resolvedOptions().pluralCategories,
      ].sort(),
      locale,
    ).toEqual([...expected].sort());
  }
});

it('requires locale-specific categories in catalogue types', () => {
  expectTypeOf<RequiredPluralCategories<'fr-FR'>>().toEqualTypeOf<
    'one' | 'many' | 'other'
  >();
  expectTypeOf<RequiredPluralCategories<'es'>>().toEqualTypeOf<
    'one' | 'many' | 'other'
  >();
  expectTypeOf<
    RequiredPluralCategories<'zh-Hans-CN'>
  >().toEqualTypeOf<'other'>();
  expectTypeOf<RequiredPluralCategories<'unknown'>>().toEqualTypeOf<'other'>();
});
