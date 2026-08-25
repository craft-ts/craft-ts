import { BrowserDocument, craftService, state } from '@craft-ts/core';
import {
  compactNumber,
  createI18nRuntime,
  dateLong,
  dateShort,
  dateTime,
  defineCatalog,
  defineLocale,
  defineLocaleLike,
  defineToken,
  integer,
  money,
  msg,
  number,
  percent,
  plural,
  relativeTime,
  type LocaleId,
} from '@craft-ts/i18n';

type OrderStatus = 'paid' | 'pending' | 'refunded';

const orderCount = number('count');
const orderAmount = money('amount', undefined, {
  currency: 'EUR',
  minimumFractionDigits: 2,
});
const conversionRate = percent('rate', undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const revenue = compactNumber('revenue', undefined, {
  maximumFractionDigits: 1,
});
const visitorCount = integer('visitors');
const orderDate = dateLong('placedAt');
const shortDate = dateShort('shortDate');
const timestamp = dateTime('timestamp', undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const daysAgo = relativeTime('daysAgo', undefined, { unit: 'day' });

const orderStatus = defineToken({
  name: 'status',
  kind: 'order-status',
  tokenId: 'demo.order-status',
  validate: (value: unknown): value is OrderStatus =>
    value === 'paid' || value === 'pending' || value === 'refunded',
  format: (value: OrderStatus, context) => {
    const labels: Record<'en' | 'fr', Record<OrderStatus, string>> = {
      en: { paid: 'Paid', pending: 'Pending', refunded: 'Refunded' },
      fr: { paid: 'Payée', pending: 'En attente', refunded: 'Remboursée' },
    };
    return labels[context.locale.startsWith('fr') ? 'fr' : 'en'][value];
  },
});

const englishCatalog = defineCatalog({
  page: {
    title: msg`Type-safe i18n playground`,
    intro: msg`Every value below is formatted by a semantic token and every message parameter is checked by TypeScript.`,
    language: msg`Language`,
    order: msg`Order total ${orderAmount}, placed on ${orderDate}.`,
    items: plural(orderCount, {
      one: msg`${orderCount} item is in the order.`,
      other: msg`${orderCount} items are in the order.`,
    }),
    status: msg`Order status: ${orderStatus}.`,
    metrics: msg`Revenue ${revenue}, ${visitorCount} visitors and a ${conversionRate} conversion rate.`,
    dates: msg`Short date: ${shortDate}; timestamp: ${timestamp}.`,
    relative: msg`The last synchronisation was ${daysAgo}.`,
    custom: msg`The custom status token keeps business values out of the shared library.`,
  },
});

const englishLocale = defineLocale('en-US', englishCatalog);
const frenchCatalog = defineLocaleLike(englishLocale, 'fr-FR', {
  page: {
    title: msg`Démonstration de l’i18n typée`,
    intro: msg`Chaque valeur est formatée par un token sémantique et chaque paramètre est vérifié par TypeScript.`,
    language: msg`Langue`,
    order: msg`Commande passée le ${orderDate} pour un total de ${orderAmount}.`,
    items: plural(orderCount, {
      one: msg`${orderCount} article est dans la commande.`,
      other: msg`${orderCount} articles sont dans la commande.`,
    }),
    status: msg`Statut de la commande : ${orderStatus}.`,
    metrics: msg`${visitorCount} visiteurs, un revenu de ${revenue} et un taux de conversion de ${conversionRate}.`,
    dates: msg`Date courte : ${shortDate} ; horodatage : ${timestamp}.`,
    relative: msg`La dernière synchronisation date de ${daysAgo}.`,
    custom: msg`Le token de statut custom garde les valeurs métier dans l’application.`,
  },
});

const locales = [englishLocale, frenchCatalog] as const;
export type DemoLocale = LocaleId<(typeof locales)[number]>;

/**
 * The demo has one active locale for the whole application. Components consume
 * this service instead of creating a local translation binding.
 */
export const { I18n } = craftService(
  { name: 'I18n', providedIn: 'global' },
  function* () {
    const runtime = createI18nRuntime({ locales, defaultLocale: 'en-US' });
    const language = yield* state(
      'language',
      'en-US' as DemoLocale,
      ({ set }) => {
        const setLocale = function* (next: DemoLocale) {
          runtime.setLocale(next);
          yield* set(next);
          yield* BrowserDocument.setLang(next);
        };

        return {
          setLocale,
          change: function* (event: Event) {
            const next = (event.target as HTMLSelectElement).value as DemoLocale;
            yield* setLocale(next);
          },
        };
      },
    );

    return {
      language,
      setLocale: language.setLocale,
      translate: runtime.bind(language),
    };
  },
);
