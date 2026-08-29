import { SyncOp } from '@craft-ts/effect';
import { Context, Effect, Layer } from 'effect';

/**
 * The point of this domain: `quoteShipping` and `lineTotalCents` live on the
 * SAME service, and their `Effect` types are almost identical. The Layer closes
 * over the service's dependencies when it builds, so an asynchronous member
 * surfaces with `R = never` exactly like a pure one — nothing in
 * `Effect<A, E, R>` separates them.
 *
 * `SyncOp` in `R` is the separation. It is a phantom requirement: nothing
 * provides it, it costs nothing at runtime, and it states one fact — this
 * member never suspends, so a `params`, a `craftComputed` or a `craftMethod`
 * may run it through `syncEffect(...)`.
 */
export type CartLine = {
  readonly sku: string;
  readonly label: string;
  readonly qty: number;
  readonly unitCents: number;
};

export type ShippingQuote = {
  readonly carrier: string;
  readonly cents: number;
};

const PROMO_THRESHOLD_CENTS = 5_000;
const GRAMS_PER_ITEM = 320;

export type CartPricingShape = {
  /** Asynchronous: it calls the carrier. Loaders only. */
  readonly quoteShipping: (grams: number) => Effect.Effect<ShippingQuote>;

  /** Synchronous: business arithmetic. `SyncOp` is the whole difference. */
  readonly lineTotalCents: (
    line: CartLine,
  ) => Effect.Effect<number, never, SyncOp>;
  readonly applyPromo: (cents: number) => Effect.Effect<number, never, SyncOp>;
  readonly formatPrice: (cents: number) => Effect.Effect<string, never, SyncOp>;
};

export class CartPricing extends Context.Service<
  CartPricing,
  CartPricingShape
>()('demo-effect/CartPricing') {}

export const CartPricingLive = Layer.succeed(CartPricing, {
  quoteShipping: Effect.fnUntraced(function* (grams: number) {
    // A carrier round-trip, mocked. This is what must never end up in a
    // computation: the UI would freeze waiting for it.
    yield* Effect.sleep('600 millis');
    return {
      carrier: 'Craft Express',
      cents: 490 + Math.ceil(grams / 1_000) * 120,
    };
  }),

  // The shape already declares these synchronous, so the implementations need
  // no marker: `Effect<A, E, never>` is assignable to `Effect<A, E, SyncOp>`.
  lineTotalCents: (line: CartLine) => Effect.succeed(line.qty * line.unitCents),

  applyPromo: (cents: number) =>
    Effect.succeed(
      cents >= PROMO_THRESHOLD_CENTS ? Math.round(cents * 0.9) : cents,
    ),

  formatPrice: (cents: number) =>
    Effect.succeed(
      new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
      }).format(cents / 100),
    ),
});

/**
 * `R` is inferred: `CartPricing` from the tag, `SyncOp` from the members it
 * calls. Composition propagates the declaration — there is no list to maintain.
 */
export const cartTotalLabel = Effect.fnUntraced(function* (
  lines: readonly CartLine[],
) {
  const pricing = yield* CartPricing;

  let cents = 0;
  for (const line of lines) {
    cents += yield* pricing.lineTotalCents(line);
  }

  return yield* pricing.formatPrice(yield* pricing.applyPromo(cents));
});

/** Nothing marked to inherit from here, so the marker is spelled out. */
export const cartWeightGrams = Effect.fnUntraced(function* (
  lines: readonly CartLine[],
) {
  yield* SyncOp;
  return lines.reduce((total, line) => total + line.qty * GRAMS_PER_ITEM, 0);
});

/** Asynchronous program: a loader's job, never a computation's. */
export const quoteShipping = Effect.fnUntraced(function* (grams: number) {
  const pricing = yield* CartPricing;
  return yield* pricing.quoteShipping(grams);
});
