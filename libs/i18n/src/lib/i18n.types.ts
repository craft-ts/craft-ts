import {
  createI18nRuntime,
  defineLocale,
  defineLocaleLike,
  msg,
  number,
  plural,
} from './i18n';

const count = number('count');
const en = defineLocale('en-US', {
  cart: {
    items: plural(count, {
      one: msg`${count} item`,
      other: msg`${count} items`,
    }),
  },
});
const fr = defineLocaleLike(en, 'fr-FR', {
  cart: {
    items: plural(count, {
      one: msg`${count} article`,
      other: msg`${count} articles`,
    }),
  },
});
const runtime = createI18nRuntime({ locales: [en, fr] });

runtime.translate('cart.items', { count: 2 });

// @ts-expect-error Translation keys are a closed union.
runtime.translate('cart.unknown', { count: 2 });
// @ts-expect-error The token parameter is required.
runtime.translate('cart.items', {});
// @ts-expect-error Token parameters retain their value type.
runtime.translate('cart.items', { count: 'two' });

// @ts-expect-error A French catalogue must preserve the reference key shape.
defineLocaleLike(en, 'fr-FR', { cart: {} });

// @ts-expect-error English needs the `one` plural category.
defineLocale('en-US', { cart: { items: plural(count, { other: msg`${count}` }) } });
