import {
  button,
  craftComponent,
  div,
  heading,
  p,
  pendingNode,
  span,
  strong,
} from '@craft-ts/component';
import { craftComputed, settled, state } from '@craft-ts/core';
import {
  computedEffect,
  methodEffect,
  queryEffect,
  syncEffect,
} from '@craft-ts/effect';
import { Effect } from 'effect';
import {
  cartTotalLabel,
  cartWeightGrams,
  quoteShipping,
  type CartLine,
} from './effect-pricing-domain';
import { example } from '../../effect-demo.style';

const CATALOG: readonly Omit<CartLine, 'qty'>[] = [
  { sku: 'craft-mug', label: 'Craft mug', unitCents: 1_450 },
  { sku: 'craft-tee', label: 'Craft t-shirt', unitCents: 2_900 },
];

/**
 * Synchronous and asynchronous members of the same Effect service, side by side,
 * plus a callable method adapted from a domain-level Effect program.
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
  {},
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
          return yield* syncEffect(cartWeightGrams(yield* qty.lines()));
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

    // This is an imperative method triggered by a user action. Avoid this
    // pattern for derived values; use `computedEffect` instead.
    // ! it is imperative, avoid that kind of pattern
    const formatCurrentCart = methodEffect('formatCurrentCart', function* () {
      return cartTotalLabel(yield* qty.lines());
    });

    const formattedPreview = yield* state(
      'formattedPreview',
      'Click the button to format the current cart',
      ({ set }) => ({
        setPreview: (value: string) => set(value),
      }),
    );

    return { formattedPreview, formatCurrentCart, qty, shippingQuery };
  },
  ({ formattedPreview, formatCurrentCart, qty, shippingQuery }) =>
    div({ class: example.card, 'data-exampleTint': 'teal' }, [
      heading(
        { class: example.title },
        'Synchronous and asynchronous members of one Effect service',
      ),
      p(
        { class: example.intro },
        'The panels read the same CartPricing service. The total is declared SyncOp, so a craftComputed can run it and it updates on the same tick. The shipping quote suspends, so it stays in a loader.',
      ),
      div({ class: example.actions }, [
        button(
          'decreaseQty',
          {
            class: example.button,
            'data-exampleButton': 'square',
            type: 'button',
            click: qty.decrement,
            'aria-label': 'Remove one',
          },
          '−',
        ),
        span({ class: example.qty }, [strong(qty), ' per product']),
        button(
          'increaseQty',
          {
            class: example.button,
            'data-exampleButton': 'square',
            type: 'button',
            click: qty.increment,
            'aria-label': 'Add one',
          },
          '+',
        ),
      ]),
      div({ class: example.panels }, [
        div({ class: example.panel }, [
          p(
            { class: example.panelTitle },
            'Callable method — synchronous Effect',
          ),
          p({ class: example.result }, formattedPreview),
          button(
            'formatCurrentCart',
            {
              class: example.button,
              type: 'button',
              click: function* () {
                yield* formattedPreview.setPreview(yield* formatCurrentCart());
              },
            },
            'Format current cart',
          ),
          p({ class: example.hint }, [
            'The click calls ',
            span({ class: example.mono }, 'methodEffect'),
            ' to adapt the current cart total to a callable Craft method.',
          ]),
        ]),
        div({ class: example.panel }, [
          p({ class: example.panelTitle }, 'Cart total — synchronous'),
          p({ class: example.result }, qty.totalLabel),
          p({ class: example.hint }, [
            'Computed by ',
            span({ class: example.mono }, 'craftComputed'),
            ' through ',
            span({ class: example.mono }, 'syncEffect'),
            '. Weight: ',
            qty.weightLabel,
            '.',
          ]),
        ]),
        div({ class: example.panel }, [
          p({ class: example.panelTitle }, 'Shipping — asynchronous'),
          p({ class: example.result }, shippingQuery.quoteLabel),
          p({ class: example.hint }, [
            'Loaded by ',
            span({ class: example.mono }, 'queryEffect'),
            ', whose params still use a synchronous member.',
          ]),
        ]).pipe(
          pendingNode({
            fallback: () =>
              div(
                {
                  class: example.loading,
                  role: 'status',
                  'aria-live': 'polite',
                },
                [
                  span({ class: example.spinner, 'aria-hidden': 'true' }),
                  span('Asking the carrier…'),
                ],
              ),
          }),
        ),
      ]),
      p({ class: example.note }, [
        'Remove ',
        span({ class: example.mono }, 'SyncOp'),
        ' from a member and the ',
        span({ class: example.mono }, 'syncEffect'),
        ' call stops compiling; declare it on a member that suspends and the ',
        span({ class: example.mono }, 'craft-ts/sync-effect-body'),
        ' rule reports the body — and, at runtime, the call throws ',
        span({ class: example.mono }, 'CraftEffectNotSynchronous'),
        ' instead of freezing the page.',
      ]),
    ]),
);

export default EffectSyncMembersComponent;
