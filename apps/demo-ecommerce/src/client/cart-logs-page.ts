import {
  button,
  craftComponent,
  div,
  forNode,
  heading,
  main,
  p,
  article,
  aside,
  section,
  span,
  strong,
} from '@craft-ts/component';
import { craftComputed } from '@craft-ts/core';
import { CartLogsPageState } from './cart-logs-state';

function euros(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

export const CartLogsPage = craftComponent(
  'CartLogsPage',
  {},
  function* () {
    const cart = yield* CartLogsPageState();
    const lines = yield* craftComputed('displayLines', function* () {
      const current = yield* cart.lines();
      const products = yield* cart.products();
      return current.map((line) => ({
        ...line,
        product: products.find((product) => product.id === line.productId),
      }));
    });

    return main({ class: 'page cart-logs-page' }, [
      div({ class: 'page-head' }, [
        div([
          span({ class: 'eyebrow' }, 'Atelier · session instrumentée'),
          heading({ class: 'page-title' }, 'Un panier sous observation'),
          p(
            { class: 'subtitle' },
            'Ajoutez, ajustez ou retirez des articles. Chaque action émet un log métier et les arguments de la méthode apparaissent dans la session de debug.',
          ),
        ]),
        span({ class: 'cart-logs-badge' }, 'Logs métier actifs'),
      ]),
      div({ class: 'cart-logs-layout' }, [
        section({ class: 'cart-logs-products' }, [
          div({ class: 'cart-logs-section-head' }, [
            heading({ level: 2, class: 'summary-title' }, 'À ajouter'),
            span({ class: 'muted' }, 'Choisissez un produit'),
          ]),
          div(
            { class: 'cart-logs-product-list' },
            forNode(cart.products, { track: (product) => product.id }, (product) =>
              article({ class: 'cart-logs-product' }, [
                span({ class: 'cart-logs-emoji', 'aria-hidden': 'true' },
                  function* () { return (yield* product()).emoji ?? '🛍️'; },
                ),
                div({ class: 'cart-logs-product-copy' }, [
                  strong(function* () { return (yield* product()).name; }),
                  span({ class: 'muted' }, function* () {
                    const item = yield* product();
                    return `${euros(item.price)} · ${item.stock} en stock`;
                  }),
                ]),
                button(
                  'add-to-observed-cart',
                  {
                    type: 'button',
                    class: 'button cart-logs-add',
                    'aria-label': function* () {
                      return `Ajouter ${(yield* product()).name} au panier`;
                    },
                    *click() {
                      yield* CartLogsPageState.addProduct((yield* product()).id);
                    },
                  },
                  'Ajouter',
                ),
              ]),
            ),
          ),
        ]),
        aside({ class: 'summary cart-logs-summary' }, [
          div({ class: 'cart-logs-section-head' }, [
            heading({ level: 2, class: 'summary-title' }, 'Votre panier'),
            span({ class: 'cart-logs-count' }, function* () {
              return `${yield* cart.itemCount()} article(s)`;
            }),
          ]),
          div(
            { class: 'cart-logs-lines' },
            forNode(
              lines,
              {
                track: (line) => line.productId,
                empty: () => p({ class: 'muted cart-logs-empty' }, 'Le panier est vide. Ajoutez un produit pour commencer.'),
              },
              (line) =>
                article({ class: 'cart-logs-line' }, [
                  div({ class: 'cart-logs-line-copy' }, [
                    strong(function* () {
                      return (yield* line()).product?.name ?? 'Produit';
                    }),
                    span({ class: 'muted' }, function* () {
                      const value = yield* line();
                      return `${value.quantity} × ${euros(value.product?.price ?? 0)}`;
                    }),
                  ]),
                  div({ class: 'cart-logs-controls' }, [
                    button('decrease-observed-quantity', {
                      type: 'button',
                      class: 'stepper-button',
                      'aria-label': function* () {
                        return `Diminuer ${(yield* line()).product?.name ?? 'le produit'}`;
                      },
                      *click() {
                        yield* CartLogsPageState.changeQuantity((yield* line()).productId, -1);
                      },
                    }, '−'),
                    span({ class: 'stepper-value', 'aria-live': 'polite' },
                      function* () { return String((yield* line()).quantity); },
                    ),
                    button('increase-observed-quantity', {
                      type: 'button',
                      class: 'stepper-button',
                      'aria-label': function* () {
                        return `Augmenter ${(yield* line()).product?.name ?? 'le produit'}`;
                      },
                      disabled: function* () {
                        const value = yield* line();
                        return value.quantity >= (value.product?.stock ?? 0);
                      },
                      *click() {
                        yield* CartLogsPageState.changeQuantity((yield* line()).productId, 1);
                      },
                    }, '+'),
                    button('remove-observed-product', {
                      type: 'button',
                      class: 'cart-logs-remove',
                      'aria-label': function* () {
                        return `Retirer ${(yield* line()).product?.name ?? 'le produit'} du panier`;
                      },
                      *click() {
                        yield* CartLogsPageState.removeProduct((yield* line()).productId);
                      },
                    }, 'Retirer'),
                  ]),
                ]),
            ),
          ),
          div({ class: 'cart-logs-total' }, [
            span('Total estimé'),
            strong(function* () { return euros(yield* cart.total()); }),
          ]),
          button('empty-observed-cart', {
            type: 'button',
            class: 'button button-block cart-logs-clear',
            disabled: function* () { return (yield* cart.itemCount()) === 0; },
            *click() { yield* CartLogsPageState.emptyCart(); },
          }, 'Vider le panier'),
          p(
            { class: 'cart-logs-hint' },
            'Les lignes « cart.* » dans les logs viennent des craft methods et des méthodes d’insertion, avec leurs arguments.',
          ),
        ]),
      ]),
    ]);
  },
);
