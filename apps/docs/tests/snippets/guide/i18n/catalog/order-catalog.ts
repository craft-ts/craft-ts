// #region imports
import {
  defineCatalog,
  defineLocale,
  defineLocaleLike,
  money,
  msg,
  number,
  plural,
} from '@craft-ts/i18n';
// #endregion imports

// #region tokens
// A token names a parameter and decides how it is formatted. `amount` is a
// currency, `count` a number — and that is what types the params object.
const amount = money('amount', undefined, { currency: 'EUR' });
const count = number('count');
// #endregion tokens

// #region catalog
export const enCatalog = defineCatalog({
  order: {
    total: msg`Order total ${amount}.`,
    items: plural(count, {
      one: msg`${count} item is in the order.`,
      other: msg`${count} items are in the order.`,
    }),
  },
});

export const en = defineLocale('en-US', enCatalog);
// #endregion catalog

// #region locale-like
export const fr = defineLocaleLike(en, 'fr-FR', {
  order: {
    total: msg`Total de la commande : ${amount}.`,
    items: plural(count, {
      one: msg`${count} article est dans la commande.`,
      other: msg`${count} articles sont dans la commande.`,
    }),
  },
});
// #endregion locale-like

export const locales = [en, fr] as const;
