import { describe, expect, it } from 'vitest';

// #region shipped
import {
  compactNumber,
  dateLong,
  dateShort,
  dateTime,
  integer,
  money,
  number,
  percent,
  relativeTime,
} from '@craft-ts/i18n';

const price = money('price', undefined, { currency: 'EUR' });
const ratio = percent('ratio', undefined, { maximumFractionDigits: 1 });
const placedAt = dateLong('placedAt');
const lastSync = relativeTime('lastSync', undefined, { unit: 'day' });
// #endregion shipped

// #region custom-token
import { defineToken } from '@craft-ts/i18n';

type OrderStatus = 'paid' | 'pending' | 'refunded';

export const orderStatus = defineToken({
  name: 'status',
  kind: 'order-status',
  tokenId: 'app.order-status',
  // The guard is what keeps an arbitrary string out of the params type.
  validate: (value: unknown): value is OrderStatus =>
    value === 'paid' || value === 'pending' || value === 'refunded',
  format: (value: OrderStatus, context) =>
    context.locale.startsWith('fr')
      ? { paid: 'Payée', pending: 'En attente', refunded: 'Remboursée' }[value]
      : { paid: 'Paid', pending: 'Pending', refunded: 'Refunded' }[value],
});
// #endregion custom-token

// #region custom-factory
import { defineTokenFactory } from '@craft-ts/i18n';

// One factory, many parameter names: `duration('elapsed')`, `duration('ttl')`.
export const duration = defineTokenFactory<
  'duration',
  number,
  { readonly unit?: Intl.RelativeTimeFormatUnit }
>({
  kind: 'duration',
  format: (options) => (value: number, context) =>
    new Intl.NumberFormat(context.locale, {
      style: 'unit',
      unit: options?.unit ?? 'minute',
    }).format(value),
});
// #endregion custom-factory

describe('guide/i18n/tokens.md', () => {
  it('formats through Intl, per locale', () => {
    const context = { locale: 'fr-FR' } as const;
    expect(price.format(12.5, context)).toContain('12,50');
    expect(ratio.format(0.125, context)).toContain('12,5');
  });

  it('gives a custom token the same shape as a shipped one', () => {
    expect(orderStatus.format('paid', { locale: 'fr-FR' })).toBe('Payée');
    expect(orderStatus.validate?.('shipped')).toBe(false);
  });

  it('names the parameter from the factory call', () => {
    expect(duration('elapsed').name).toBe('elapsed');
    expect([number, integer, compactNumber, dateShort, dateTime].every(
      (factory) => typeof factory === 'function',
    )).toBe(true);
    expect(typeof placedAt.format).toBe('function');
    expect(typeof lastSync.format).toBe('function');
  });
});
