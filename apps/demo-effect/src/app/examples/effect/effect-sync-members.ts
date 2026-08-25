/* eslint-disable craft-ts/no-hardcoded-design-values -- Dedicated demo UI styles. */
import {
  button,
  craftComponent,
  div,
  heading,
  p,
  pendingBlock,
  span,
  strong,
} from '@craft-ts/component';
import { craftComputed, settled, state } from '@craft-ts/core';
import { computedEffect, queryEffect, syncEffect } from '@craft-ts/effect';
import { Effect } from 'effect';
import {
  cartTotalLabel,
  cartWeightGrams,
  quoteShipping,
  type CartLine,
} from './effect-pricing-domain';

const CATALOG: readonly Omit<CartLine, 'qty'>[] = [
  { sku: 'craft-mug', label: 'Craft mug', unitCents: 1_450 },
  { sku: 'craft-tee', label: 'Craft t-shirt', unitCents: 2_900 },
];

/**
 * Two members of the same Effect service, side by side.
 *
 * The total is computed by `craftComputed`, which runs on Craft's synchronous
 * driver: it updates on the very tick the button is clicked, with no loading
 * state, because `cartTotalLabel` only calls members declared `SyncOp`.
 *
 * The shipping quote goes through `queryEffect`, because it suspends. Its
 * `params` still uses a synchronous member to compute the cart weight — that is
 * the position where an undeclared Effect used to be banned outright.
 */
const EffectSyncMembersComponent = craftComponent(
  'EffectSyncMembersComponent',
  {
    styles: `
      :scope { display: block; max-width: 880px; margin: 2rem auto; padding: 1.5rem; border: 1px solid #ccfbf1; border-radius: 12px; color: #134e4a; background: #f0fdfa; }
      :scope h1 { margin: 0 0 0.5rem; color: #042f2e; }
      .intro { margin: 0 0 1.25rem; color: #115e59; line-height: 1.55; }
      .actions { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.25rem; }
      .actions button { width: 2.25rem; height: 2.25rem; border: 1px solid #5eead4; border-radius: 6px; color: #0f766e; background: #fff; font-size: 1.1rem; cursor: pointer; }
      .qty { min-width: 6rem; color: #0f766e; font-size: 0.9rem; }
      .panels { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
      .panel { padding: 1rem 1.1rem; border: 1px solid #99f6e4; border-radius: 8px; background: #fff; }
      .panel-title { margin: 0 0 0.65rem; color: #64748b; font-size: 0.72rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
      .result { margin: 0; color: #042f2e; font-size: 1.35rem; font-weight: 600; }
      .shipping-loading { display: flex; align-items: center; gap: 0.5rem; min-height: 2rem; margin: 0; color: #0f766e; font-size: 0.95rem; }
      .shipping-spinner { width: 0.8rem; height: 0.8rem; flex: 0 0 auto; border: 2px solid #99f6e4; border-top-color: #0f766e; border-radius: 50%; animation: EffectSyncMembersComponent-shipping-spin 0.7s linear infinite; }
      @keyframes EffectSyncMembersComponent-shipping-spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { .shipping-spinner { animation: none; } }
      .hint { margin: 0.5rem 0 0; color: #475569; font-size: 0.8rem; line-height: 1.5; }
      .note { margin-top: 1.25rem; color: #115e59; font-size: 0.85rem; line-height: 1.6; }
      .mono { padding: 0.05rem 0.3rem; border-radius: 3px; background: #ccfbf1; font-family: ui-monospace, monospace; font-size: 0.8rem; }
      button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    `,
  },
  function* () {
    // Everything derived from the quantity alone lives in its insertion.
    const qty = yield* state('qty', 2, ({ state: read, update }) => {
      const lines = craftComputed('lines', function* () {
        const currentQty = yield* read();
        return CATALOG.map((item) => ({ ...item, qty: currentQty }));
      });

      return {
        increment: () => update((value) => Math.min(20, value + 1)),
        decrement: () => update((value) => Math.max(0, value - 1)),
        lines,

        // `computedEffect` is the Effect counterpart of `craftComputed`: the
        // factory RETURNS the Effect, the adapter runs it in place. The value
        // is ready before the computation returns — no pending state, no flash.
        totalLabel: computedEffect('totalLabel', function* () {
          return cartTotalLabel(yield* lines());
        }),

        weightLabel: computedEffect('weightLabel', function* () {
          return Effect.map(
            cartWeightGrams(yield* lines()),
            (grams) => `${(grams / 1_000).toFixed(2)} kg`,
          );
        }),
      };
    });

    // Asynchronous: the carrier call belongs to a loader. Its params, however,
    // are still built with a synchronous member.
    const shippingQuery = yield* queryEffect(
      'shippingQuery',
      {
        params: function* () {
          return yield* cartWeightGrams(yield* qty.lines());
        },
        loader: ({ params }) => quoteShipping(params),
      },
      ({ resource }) => ({
        quoteLabel: craftComputed('quoteLabel', function* () {
          const quote = yield* settled(resource);
          return `${quote.carrier} — ${(quote.cents / 100).toFixed(2)} €`;
        }),
      }),
    );

    return { qty, shippingQuery };
  },
  ({ qty, shippingQuery }) =>
    div([
      heading('Synchronous and asynchronous members of one Effect service'),
      p(
        { class: 'intro' },
        'Both panels read the same CartPricing service. The total is declared SyncOp, so a craftComputed can run it and it updates on the same tick. The shipping quote suspends, so it stays in a loader.',
      ),
      div({ class: 'actions' }, [
        button(
          'decreaseQty',
          { type: 'button', click: qty.decrement, 'aria-label': 'Remove one' },
          '−',
        ),
        span({ class: 'qty' }, [strong(qty), ' per product']),
        button(
          'increaseQty',
          { type: 'button', click: qty.increment, 'aria-label': 'Add one' },
          '+',
        ),
      ]),
      div({ class: 'panels' }, [
        div({ class: 'panel' }, [
          p({ class: 'panel-title' }, 'Cart total — synchronous'),
          p({ class: 'result' }, qty.totalLabel),
          p({ class: 'hint' }, [
            'Computed by ',
            span({ class: 'mono' }, 'craftComputed'),
            ' through ',
            span({ class: 'mono' }, 'syncEffect'),
            '. Weight: ',
            qty.weightLabel,
            '.',
          ]),
        ]),
        div({ class: 'panel' }, [
          p({ class: 'panel-title' }, 'Shipping — asynchronous'),
          p({ class: 'result' }, shippingQuery.quoteLabel),
          p({ class: 'hint' }, [
            'Loaded by ',
            span({ class: 'mono' }, 'queryEffect'),
            ', whose params still use a synchronous member.',
          ]),
        ]).pipe(
          pendingBlock({
            fallback: () =>
              div(
                {
                  class: 'shipping-loading',
                  role: 'status',
                  'aria-live': 'polite',
                },
                [
                  span({ class: 'shipping-spinner', 'aria-hidden': 'true' }),
                  span('Asking the carrier…'),
                ],
              ),
          }),
        ),
      ]),
      p({ class: 'note' }, [
        'Remove ',
        span({ class: 'mono' }, 'SyncOp'),
        ' from a member and the ',
        span({ class: 'mono' }, 'syncEffect'),
        ' call stops compiling; declare it on a member that suspends and the ',
        span({ class: 'mono' }, 'craft-ts/sync-effect-body'),
        ' rule reports the body — and, at runtime, the call throws ',
        span({ class: 'mono' }, 'CraftEffectNotSynchronous'),
        ' instead of freezing the page.',
      ]),
    ]),
);

export default EffectSyncMembersComponent;
