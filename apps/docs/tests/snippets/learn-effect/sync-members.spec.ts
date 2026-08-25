// @vitest-environment jsdom
import { mountCraftComponent } from '@craft-ts/component';
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import { installCraftEffectBridge, provideLayer } from '@craft-ts/effect';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// #region domain
import { Context, Effect, Layer } from 'effect';
import { SyncOp } from '@craft-ts/effect';

export type CartLine = {
  readonly sku: string;
  readonly qty: number;
  readonly unitCents: number;
};

export type CartPricingShape = {
  // Asynchronous: `R` is `never` and it still goes to the network — the Layer
  // closed over the transport at construction. Nothing in the type says so.
  readonly fetchCatalog: (
    skus: readonly string[],
  ) => Effect.Effect<ReadonlyMap<string, number>>;

  // Synchronous: `SyncOp` in `R` is the whole difference.
  readonly lineTotal: (line: CartLine) => Effect.Effect<number, never, SyncOp>;
  readonly formatPrice: (cents: number) => Effect.Effect<string, never, SyncOp>;
};

export class CartPricing extends Context.Service<
  CartPricing,
  CartPricingShape
>()('learn-effect/CartPricing') {}

export const CartPricingLive = Layer.sync(CartPricing)(() => ({
  fetchCatalog: (skus) =>
    Effect.gen(function* () {
      yield* Effect.sleep('50 millis');
      return new Map(skus.map((sku) => [sku, 1_000]));
    }),

  // The shape already declares these synchronous, so the implementations need
  // no ceremony: Effect<A, E, never> is assignable to Effect<A, E, SyncOp>.
  lineTotal: (line) => Effect.succeed(line.qty * line.unitCents),
  formatPrice: (cents) => Effect.succeed(`${(cents / 100).toFixed(2)} €`),
}));
// #endregion domain

// #region standalone
/**
 * `R` is inferred here: `CartPricing` from the tag, `SyncOp` from the members.
 * Composition propagates the declaration — nothing to maintain by hand.
 */
export function cartTotalLabel(lines: readonly CartLine[]) {
  return Effect.gen(function* () {
    const pricing = yield* CartPricing;

    let cents = 0;
    for (const line of lines) {
      cents += yield* pricing.lineTotal(line);
    }

    return yield* pricing.formatPrice(cents);
  });
}

/** No marked call to inherit from, so the marker is spelled out. */
export function cartWeight(lines: readonly CartLine[]) {
  return Effect.gen(function* () {
    yield* SyncOp;
    return lines.reduce((total, line) => total + line.qty * 250, 0);
  });
}
// #endregion standalone

// #region component
import { craftComponent, p } from '@craft-ts/component';
import { state } from '@craft-ts/core';
import { computedEffect } from '@craft-ts/effect';

export const CartTotal = craftComponent(
  'LearnEffectCartTotal',
  {},
  function* () {
    const lines = yield* state('lines', [
      { sku: 'sku-1', qty: 2, unitCents: 1_000 },
      { sku: 'sku-2', qty: 1, unitCents: 1_000 },
    ] as CartLine[]);

    // The factory RETURNS the Effect; `computedEffect` runs it in place.
    const totalLabel = computedEffect('totalLabel', function* () {
      return cartTotalLabel(yield* lines());
    });

    return { totalLabel };
  },
  ({ totalLabel }) => [p(totalLabel)],
);
// #endregion component

// #region refused
const catalogProgram = Effect.gen(function* () {
  const pricing = yield* CartPricing;
  return yield* pricing.fetchCatalog(['sku-1']);
});

export function cartSummary() {
  // ✅ declared synchronous — `SyncOp` is in its requirements.
  const weightLabel = computedEffect('weightLabel', () => cartWeight([]));

  // ❌ `fetchCatalog` suspends and nobody declared otherwise: a computation
  //    cannot run it. Use queryEffect.
  const catalogLabel = computedEffect(
    'catalogLabel',
    // @ts-expect-error NotDeclaredSynchronous
    () => catalogProgram,
  );

  return { weightLabel, catalogLabel };
}
// #endregion refused

describe('Effect synchronous members snippet', () => {
  let disposeBridge: () => void;

  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
    disposeBridge = installCraftEffectBridge();
  });

  afterEach(() => {
    disposeBridge();
    TestBed.resetTestingModule();
  });

  it('computes the label on the same tick — no await anywhere', () => {
    const element = document.createElement('div');
    document.body.append(element);
    const injector = TestBed.rootInjector.createChild([
      provideLayer(CartPricingLive),
    ]);

    const mounted = mountCraftComponent(
      CartTotal,
      element,
      injector as unknown as Injector,
    );
    TestBed.tick();

    // The assertion is the absence of `await`: a `craftComputed` runs on the
    // synchronous driver, so anything it reads must settle on this tick.
    expect(element.textContent).toContain('30.00');

    mounted.destroy();
    injector.destroy();
  });
});
