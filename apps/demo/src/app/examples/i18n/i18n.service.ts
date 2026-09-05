import { craftComputed, craftService, state } from '@craft-ts/core';
import {
  compactNumber,
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
  type FormatterContext,
  type TokenSchema,
  type TranslationDependencies,
} from '@craft-ts/i18n';

type OrderStatus = 'paid' | 'pending' | 'refunded';
type DemoClientId = 'acme' | 'globex';

type UnitSystem = 'metric' | 'imperial';

const initialClient = (): DemoClientId => 'acme';

const DEMO_CLIENTS: Record<
  DemoClientId,
  {
    readonly name: string;
    readonly currency: string;
    readonly units: UnitSystem;
  }
> = {
  acme: { name: 'Acme', currency: 'CHF', units: 'metric' },
  globex: { name: 'Globex', currency: 'USD', units: 'imperial' },
};

/** A component-scoped service: each client can carry its own currency. */
export const { ClientCurrency, provideClientCurrency } = craftService(
  { name: 'ClientCurrency', providedIn: 'toProvide' },
  function* () {
    // The currency derives from this state and nothing else, so it belongs to
    // the primitive's insertion rather than to a computed beside it.
    // No cast: it would erase what each member yields, and a reader typed
    // `Generator<unknown, …>` swallows the service request of whoever reads it
    // — the token's dependency map would come back empty.
    const client = yield* state(
      'client',
      initialClient(),
      ({ state: selected, set }) => ({
        changeClient: (next: DemoClientId) => set(next),
        currency: craftComputed(function* () {
          const clientDetails = DEMO_CLIENTS[yield* selected()];
          return { code: clientDetails.currency, name: clientDetails.name };
        }),
      }),
    );

    return {
      client,
      changeClient: client.changeClient,
      currency: client.currency,
    };
  },
);

/**
 * A second component-scoped service, built on the first one. A token that
 * resolves it therefore drags `ClientCurrency` along, and the component DI
 * check reports both when a provider is missing.
 */
export const { ClientUnits, provideClientUnits } = craftService(
  { name: 'ClientUnits', providedIn: 'toProvide' },
  function* () {
    const clientCurrency = yield* ClientCurrency();
    // A plain reader rather than a `craftComputed`: the value it derives from
    // belongs to another service, and the reactive read happens where it is
    // consumed.
    const system = function* () {
      return DEMO_CLIENTS[yield* clientCurrency.client()].units;
    };

    return { system };
  },
);

/**
 * A Standard Schema — the same contract the rest of the application already
 * uses for `state`, `query` and forms. Written by hand here because the demo
 * ships no schema library; a Zod or Valibot schema drops in unchanged.
 */
const isoDateSchema = {
  '~standard': {
    version: 1,
    vendor: 'craft-demo',
    types: undefined,
    validate(value: unknown) {
      if (typeof value !== 'string') {
        return { issues: [{ message: 'An ISO date string is expected.' }] };
      }
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime())
        ? { issues: [{ message: `${value} is not a valid ISO date.` }] }
        : { value: parsed };
    },
  },
} satisfies TokenSchema<Date, string>;

/** Rejects the value rather than formatting a negative weight. */
const positiveNumberSchema = {
  '~standard': {
    version: 1,
    vendor: 'craft-demo',
    types: undefined,
    validate(value: unknown) {
      return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? { value }
        : { issues: [{ message: 'A weight must be a positive number.' }] };
    },
  },
} satisfies TokenSchema<number, number>;

const weightFormatter =
  (unit: 'kilogram' | 'pound') => (value: number, context: FormatterContext) =>
    new Intl.NumberFormat(context.locale, {
      style: 'unit',
      unit,
      unitDisplay: 'short',
      maximumFractionDigits: 1,
    }).format(unit === 'pound' ? value * 2.20462 : value);

/**
 * A project token that takes a parameter *and* resolves a service: the weight
 * in kilogrammes comes from the call site, the unit the reader sees comes from
 * the client profile. The schema parses the parameter before either is used.
 */
const orderWeight = defineToken({
  name: 'weight',
  kind: 'order-weight',
  tokenId: 'demo.order-weight',
  schema: positiveNumberSchema,
  resolveFormatter: function* () {
    const units = yield* ClientUnits();
    return weightFormatter(
      (yield* units.system()) === 'imperial' ? 'pound' : 'kilogram',
    );
  },
});

const orderCount = number('count');

const conversionRate = percent('rate', undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const revenue = compactNumber('revenue', undefined, {
  maximumFractionDigits: 1,
});
const visitorCount = integer('visitors');
const orderDate = dateLong('placedAt', isoDateSchema);
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

export const orderAmount = money('amount', function* () {
  const clientCurrency = yield* ClientCurrency();
  const currency = yield* clientCurrency.currency();

  return {
    currency: currency.code,
    minimumFractionDigits: 2,
  };
});

const englishCatalog = defineCatalog({
  page: {
    title: msg`Type-safe i18n playground`,
    intro: msg`Every value below is formatted by a semantic token and every message parameter is checked by TypeScript.`,
    language: msg`Language`,
    order: msg`Order total ${orderAmount} for ${orderWeight}, placed on ${orderDate}.`,
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
export type DemoOrderTranslationDependencies = TranslationDependencies<
  typeof englishLocale,
  'page.order'
>;
const frenchCatalog = defineLocaleLike(englishLocale, 'fr-FR', {
  page: {
    title: msg`Démonstration de l’i18n typée`,
    intro: msg`Chaque valeur est formatée par un token sémantique et chaque paramètre est vérifié par TypeScript.`,
    language: msg`Langue`,
    order: msg`Commande de ${orderWeight} passée le ${orderDate} pour un total de ${orderAmount}.`,
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

export const locales = [englishLocale, frenchCatalog] satisfies readonly [
  typeof englishLocale,
  typeof frenchCatalog,
];
export type DemoLocale = LocaleId<(typeof locales)[number]>;
