import { a, article, aside, button, craftComponent, div, forNode, heading, headingSection, ifNode, li, main, p, section, span, strong, ul } from '@craft-ts/component';
import { CraftRouter, CraftRouterLink, craftComputed, craftService, craftUse, isCraftException, query } from '@craft-ts/core';
import { catalog, placeOrder } from './api';
import { categoryName, categoryTone, euros, failureOf, groupRule, lineKey, productEmoji, stockLabel } from './shop-format';
import { ProductIdPathParams } from './product-id-path-params';
import { Cart, ShopUi, quantityInCart } from './shop-state';
import type { Catalog, CartLine, Category, Product } from '../shared/model';
import { initialStore } from '../shared/model';

const loadStore = function* (): Generator<unknown, Catalog, unknown> {
  try { return yield* catalog({}); }
  catch { return structuredClone(initialStore); }
};
function* goToProduct(product: Product) {
  if (product.kind === 'formule') yield* CraftRouter.navigate({ to: 'formule/:productId', params: { productId: product.id } });
  else yield* CraftRouter.navigate({ to: 'produit/:productId', params: { productId: product.id } });
}
const isAvailable = (product: Product) => product.kind === 'formule' || product.stock > 0;

export const { StorefrontView, provideStorefrontView } = craftService({ name: 'storefrontView', providedIn: 'toProvide' }, function* () {
  const cart = yield* Cart();
  yield* query('storeQuery', { params: () => true, loader: loadStore }, ({ resource }) => ({
    products: craftUse(craftComputed('storeProducts', function* () { return (yield* resource.value())?.products ?? []; })),
    simpleProducts: craftUse(craftComputed('storeSimpleProducts', function* () { return ((yield* resource.value())?.products ?? []).filter((product) => product.kind === 'simple'); })),
    featuredProducts: craftUse(craftComputed('featuredProducts', function* () {
      const products = (yield* resource.value())?.products ?? [];
      return [...products.filter((product) => product.kind === 'formule'), ...products.filter((product) => product.kind === 'simple' && product.stock > 0)].slice(0, 3);
    })),
    categories: craftUse(craftComputed('storeCategories', function* () { return (yield* resource.value())?.categories ?? []; })),
  }));
  yield* query('placeOrderProcess', {
    method: (lines: readonly CartLine[]) => lines,
    loader: function* ({ params: lines }) {
      const order = yield* placeOrder({ lines });
      if (!isCraftException(order)) yield* cart.cartLines.clear();
      return order;
    },
  });
});

/** La fiche ouverte, suivie depuis l'URL : passer d'un produit à l'autre réutilise la même page. */
export const { ProductView, provideProductView } = craftService({ name: 'productView', providedIn: 'toProvide' }, function* () {
  const { storeQuery } = yield* StorefrontView();
  const productId = yield* ProductIdPathParams();
  const currentProduct = yield* craftComputed('currentProduct', function* () {
    const id = yield* productId();
    return (yield* storeQuery.products()).find((product) => product.id === id);
  });
  yield* craftComputed('relatedProducts', function* () {
    const current = yield* currentProduct();
    if (!current) return [];
    const others = (yield* storeQuery.products()).filter((product) => product.id !== current.id && isAvailable(product));
    return [...others.filter((product) => product.categoryId === current.categoryId), ...others.filter((product) => product.categoryId !== current.categoryId)].slice(0, 3);
  });
});

/** Ce que les gabarits partagés lisent du service Cart. */
interface CartApi {
  readonly cartLines: Read<readonly CartLine[]> & {
    readonly add: (line: CartLine) => Generator<unknown, unknown, unknown>;
    readonly shift: (key: string, delta: number) => Generator<unknown, unknown, unknown>;
  };
}
// Lecture paresseuse d'une valeur du gabarit (élément de forNode, computed, générateur).
type Read<T> = () => Generator<unknown, T, unknown>;

function productVisual(product: Read<Product | undefined>, size: 'card' | 'hero' | 'thumb') {
  return div({ class: 'visual', 'data-size': size, 'data-tone': function* () { const value = yield* product(); return value ? categoryTone(value.categoryId) : 'sage'; } }, [
    span({ class: 'visual-emoji', 'aria-hidden': 'true' }, function* () { const value = yield* product(); return value ? productEmoji(value) : '🍽️'; }),
  ]);
}

/**
 * Le bouton « Ajouter » devient un sélecteur de quantité dès que le produit est
 * dans le panier : on voit ce qu'on a déjà pris, et on ajuste sans quitter la page.
 */
function addToCartControl(cart: CartApi, product: Read<Product | undefined>, size: 'compact' | 'large') {
  return ifNode('in-cart', function* () {
    const value = yield* product();
    return value?.kind === 'simple' && quantityInCart(yield* cart.cartLines(), value.id) > 0;
  },
  () => div({ class: 'stepper', 'data-size': size }, [
    button('decrease', { type: 'button', class: 'stepper-button', 'aria-label': 'Retirer un exemplaire', *click() {
      const value = yield* product();
      if (value) yield* cart.cartLines.shift(lineKey({ productId: value.id }), -1);
    } }, '−'),
    span({ class: 'stepper-value', 'aria-live': 'polite' }, function* () {
      const value = yield* product();
      const quantity = value ? quantityInCart(yield* cart.cartLines(), value.id) : 0;
      return size === 'large' ? `${quantity} dans le panier` : String(quantity);
    }),
    button('increase', { type: 'button', class: 'stepper-button', 'aria-label': 'Ajouter un exemplaire', disabled: function* () {
      const value = yield* product();
      return value?.kind !== 'simple' || quantityInCart(yield* cart.cartLines(), value.id) >= value.stock;
    }, *click() {
      const value = yield* product();
      if (value) yield* cart.cartLines.shift(lineKey({ productId: value.id }), 1);
    } }, '+'),
  ]),
  () => button('add-product', { type: 'button', class: 'button add-button', 'data-size': size, disabled: function* () { const value = yield* product(); return !value || !isAvailable(value); }, *click() {
    const value = yield* product();
    if (!value) return;
    if (value.kind === 'formule') yield* goToProduct(value);
    else if (value.stock > 0) yield* cart.cartLines.add({ productId: value.id, quantity: 1 });
  } }, function* () {
    const value = yield* product();
    if (!value) return 'Ajouter';
    if (value.kind === 'formule') return 'Composer →';
    if (value.stock <= 0) return 'Épuisé';
    return size === 'large' ? `Ajouter au panier · ${euros(value.price)}` : '+ Ajouter';
  }));
}

function productCard(cart: CartApi, categories: Read<readonly Category[]>, product: Read<Product>) {
  const openProduct = function* () { yield* goToProduct(yield* product()); };
  return article({ class: 'card', 'data-sold-out': function* () { return isAvailable(yield* product()) ? undefined : 'true'; } }, [
    button('open-visual', { type: 'button', class: 'card-visual', 'aria-label': function* () { return `Voir ${(yield* product()).name}`; }, click: openProduct }, [
      productVisual(product, 'card'),
      ifNode('formula-tag', function* () { return (yield* product()).kind === 'formule'; }, () => span({ class: 'corner-tag' }, 'À composer')),
      ifNode('formula-count', function* () { const value = yield* product(); return value.kind === 'formule' && quantityInCart(yield* cart.cartLines(), value.id) > 0; },
        () => span({ class: 'corner-tag', 'data-tone': 'ink' }, function* () { return `${quantityInCart(yield* cart.cartLines(), (yield* product()).id)} au panier`; })),
    ]),
    div({ class: 'card-body' }, [
      span({ class: 'badge' }, function* () { return categoryName(yield* categories(), (yield* product()).categoryId); }),
      button('open-title', { type: 'button', class: 'card-title', click: openProduct }, function* () { return (yield* product()).name; }),
      p({ class: 'card-text' }, function* () { return (yield* product()).description; }),
      div({ class: 'card-foot' }, [
        div([
          span({ class: 'price' }, function* () { return euros((yield* product()).price); }),
          span({ class: 'stock-hint', 'data-level': function* () { const value = yield* product(); return value.kind === 'simple' && value.stock <= 3 ? 'low' : undefined; } }, function* () { const value = yield* product(); return value.kind === 'simple' ? stockLabel(value.stock) : 'Formule'; }),
        ]),
        addToCartControl(cart, product, 'compact'),
      ]),
    ]),
  ]);
}

const HomePage = craftComponent('EcommerceHomePage', { providers: [provideStorefrontView()] }, function* () {
  const { storeQuery } = yield* StorefrontView();
  const cart = yield* Cart();
  return main([
    section({ class: 'hero' }, [
      div({ class: 'hero-copy' }, [
        span({ class: 'eyebrow' }, 'Une pause qui fait du bien'),
        heading('Du bon, tout simplement.'),
        p('Un café de quartier, des pâtisseries du matin et des formules à composer selon vos envies.'),
        div({ class: 'hero-actions' }, [
          a('hero-shop', { class: 'button button-light' }, 'Découvrir la boutique →').pipe(CraftRouterLink({ to: 'catalogue' })),
          a('hero-formula', { class: 'button button-outline' }, 'Composer une formule').pipe(CraftRouterLink({ to: 'formule/:productId', params: { productId: 'pause-cafe' } })),
        ]),
      ]),
      div({ class: 'hero-art', 'aria-hidden': 'true' }, [span('☕'), span('🥐'), span('🍪')]),
    ]),
    ul({ class: 'perks' }, [
      li([strong('Préparé le matin même'), span('Viennoiseries sorties du four à 7 h.')]),
      li([strong('Retrait offert'), span('Votre commande vous attend au comptoir.')]),
      li([strong('Formules sur mesure'), span('Vous choisissez chaque élément.')]),
    ]),
    div({ class: 'section-head' }, [div([span({ class: 'eyebrow' }, 'À la carte'), heading({ level: 2, class: 'section-title' }, 'Les incontournables')]), a('home-all', { class: 'text-link' }, 'Tout voir →').pipe(CraftRouterLink({ to: 'catalogue' }))]),
    div({ class: 'grid' }, forNode(storeQuery.featuredProducts, { track: (product) => product.id }, (product) => productCard(cart, storeQuery.categories, product))),
  ]);
});

const CataloguePage = craftComponent('EcommerceCataloguePage', { providers: [provideStorefrontView()] }, function* () {
  const { storeQuery } = yield* StorefrontView();
  const cart = yield* Cart();
  const shopUi = yield* ShopUi();
  const visibleProducts = yield* craftComputed('visibleProducts', function* () {
    const filter = yield* shopUi.categoryFilter();
    const products = (yield* storeQuery.products()).filter((product) => filter === 'all' || product.categoryId === filter);
    // Les produits épuisés restent visibles, en fin de liste, pour qu'on sache qu'ils reviendront.
    return [...products.filter(isAvailable), ...products.filter((product) => !isAvailable(product))];
  });
  return main([
    div({ class: 'page-head' }, [
      div([span({ class: 'eyebrow' }, 'Le comptoir'), heading({ class: 'page-title' }, 'La boutique'), p({ class: 'subtitle' }, 'Tout est préparé avec soin. Ajoutez, ajustez les quantités, le panier suit.')]),
    ]),
    div({ class: 'chips', role: 'toolbar', 'aria-label': 'Filtrer par catégorie' }, [
      button('filter-all', { type: 'button', class: 'chip', 'aria-pressed': function* () { return (yield* shopUi.categoryFilter()) === 'all' ? 'true' : 'false'; }, *click() { yield* shopUi.categoryFilter.choose('all'); } }, 'Tout'),
      forNode(storeQuery.categories, { track: (category) => category.id }, (category) =>
        button('filter-category', { type: 'button', class: 'chip', 'aria-pressed': function* () { return (yield* shopUi.categoryFilter()) === (yield* category()).id ? 'true' : 'false'; }, *click() { yield* shopUi.categoryFilter.choose((yield* category()).id); } }, function* () { return (yield* category()).name; })),
    ]),
    ifNode(storeQuery.isLoading, () => div({ class: 'grid' }, [div({ class: 'card skeleton' }), div({ class: 'card skeleton' }), div({ class: 'card skeleton' })]),
      () => div({ class: 'grid' }, forNode(visibleProducts, { track: (product) => product.id, empty: () => p({ class: 'empty-note' }, 'Rien dans cette catégorie pour le moment.') }, (product) => productCard(cart, storeQuery.categories, product)))),
  ]);
});

const ProductPage = craftComponent('EcommerceProductPage', { providers: [provideStorefrontView(), provideProductView()] }, function* () {
  const { storeQuery } = yield* StorefrontView();
  const { currentProduct: product, relatedProducts } = yield* ProductView();
  const cart = yield* Cart();
  return main([
    a('back-catalog', { class: 'text-link back-link' }, '← La boutique').pipe(CraftRouterLink({ to: 'catalogue' })),
    ifNode(storeQuery.isLoading, () => div({ class: 'product-layout' }, [div({ class: 'visual skeleton', 'data-size': 'hero' }), div({ class: 'panel skeleton' })]),
      () => ifNode('product-found', function* () { return (yield* product()) !== undefined; },
        () => div({ class: 'product-layout' }, [
          productVisual(product, 'hero'),
          section({ class: 'product-info' }, [
            span({ class: 'badge' }, function* () { const value = yield* product(); return value ? categoryName(yield* storeQuery.categories(), value.categoryId) : ''; }),
            heading({ class: 'page-title' }, function* () { return (yield* product())?.name ?? ''; }),
            p({ class: 'lead' }, function* () { return (yield* product())?.description ?? ''; }),
            div({ class: 'price-row' }, [
              span({ class: 'price large' }, function* () { const value = yield* product(); return value ? euros(value.price) : ''; }),
              span({ class: 'stock-hint', 'data-level': function* () { const value = yield* product(); if (value?.kind !== 'simple') return undefined; return value.stock <= 0 ? 'out' : value.stock <= 3 ? 'low' : 'ok'; } }, function* () { const value = yield* product(); return value?.kind === 'simple' ? stockLabel(value.stock) : 'Formule à composer'; }),
            ]),
            ifNode('formula-groups', function* () { return (yield* product())?.kind === 'formule'; }, () => ul({ class: 'formula-rules' }, function* () {
              const value = yield* product();
              const categories = yield* storeQuery.categories();
              return value?.kind === 'formule' ? value.groups.map((group) => `${categoryName(categories, group.categoryId)} · ${groupRule(group)}`).join('  ·  ') : '';
            })),
            addToCartControl(cart, product, 'large'),
            ul({ class: 'reassurance' }, [li('🕖 Préparé le matin même'), li('🛍 Retrait offert au comptoir'), li('🔒 Paiement de démonstration, sans carte')]),
          ]),
        ]),
        () => div({ class: 'empty-state' }, [span({ class: 'empty-emoji', 'aria-hidden': 'true' }, '🫙'), heading({ level: 2 }, 'Produit introuvable'), p({ class: 'muted' }, 'Il a peut-être quitté la carte. Jetez un œil au reste de la boutique.'), a('missing-shop', { class: 'button' }, 'Voir la boutique').pipe(CraftRouterLink({ to: 'catalogue' }))]))),
    ifNode('has-related', function* () { return (yield* relatedProducts()).length > 0; }, () => section({ class: 'related' }, [
      div({ class: 'section-head' }, [heading({ level: 2, class: 'section-title' }, 'Vous aimerez aussi')]),
      div({ class: 'grid' }, forNode(relatedProducts, { track: (item) => item.id }, (item) => productCard(cart, storeQuery.categories, item))),
    ])),
  ]);
});

const FormulaComposer = craftComponent('EcommerceFormulaComposer', {}, function* () {
  const { storeQuery } = yield* StorefrontView();
  const cart = yield* Cart();
  const shopUi = yield* ShopUi();
  const formula = yield* (yield* ProductView()).currentProduct();
  if (!formula || formula.kind !== 'formule') return div({ class: 'empty-state' }, [heading({ level: 2 }, 'Cette formule est introuvable.'), a('missing-formula-shop', { class: 'button' }, 'Voir la boutique').pipe(CraftRouterLink({ to: 'catalogue' }))]);
  const products = yield* storeQuery.simpleProducts();
  const categories = yield* storeQuery.categories();
  const picksOf = function* (groupId: string) { return (yield* shopUi.formulaPicks())[formula.id]?.[groupId] ?? []; };
  const isComplete = function* () {
    const picks = (yield* shopUi.formulaPicks())[formula.id] ?? {};
    return formula.groups.every((group) => { const count = picks[group.id]?.length ?? 0; return count >= group.min && count <= group.max; });
  };
  return div({ class: 'composer' }, [
    div({ class: 'composer-steps' }, formula.groups.map((group, index) => {
      const options = products.filter((product) => product.categoryId === group.categoryId);
      return section({ class: 'step' }, [
        div({ class: 'step-head' }, [
          span({ class: 'step-number' }, String(index + 1)),
          div([heading({ level: 2, class: 'step-title' }, `Choisissez : ${categoryName(categories, group.categoryId).toLowerCase()}`), span({ class: 'muted' }, groupRule(group))]),
          span({ class: 'step-status', 'data-done': function* () { const count = (yield* picksOf(group.id)).length; return count >= group.min && count > 0 ? 'true' : undefined; } }, function* () { return `${(yield* picksOf(group.id)).length} / ${group.max}`; }),
        ]),
        div({ class: 'options' }, [...options.map((product) => button('formula-choice', {
          type: 'button',
          class: 'option',
          'aria-pressed': function* () { return (yield* picksOf(group.id)).includes(product.id) ? 'true' : 'false'; },
          disabled: function* () {
            if (product.stock <= 0) return true;
            const picked = yield* picksOf(group.id);
            return group.max > 1 && picked.length >= group.max && !picked.includes(product.id);
          },
          *click() { yield* shopUi.formulaPicks.toggle(formula.id, group, product.id); },
        }, [
          span({ class: 'option-emoji', 'data-tone': categoryTone(product.categoryId), 'aria-hidden': 'true' }, productEmoji(product)),
          span({ class: 'option-text' }, [strong(product.name), span({ class: 'muted' }, product.stock > 0 ? `Inclus · ${stockLabel(product.stock).toLowerCase()}` : 'Épuisé')]),
          span({ class: 'option-check', 'aria-hidden': 'true' }, '✓'),
        ])), ...(options.length ? [] : [p({ class: 'muted' }, 'Aucun produit disponible dans cette catégorie.')])]),
      ]);
    })),
    aside({ class: 'summary' }, [
      div({ class: 'summary-head' }, [span({ class: 'summary-emoji', 'data-tone': categoryTone(formula.categoryId), 'aria-hidden': 'true' }, productEmoji(formula)), div([strong(formula.name), p({ class: 'muted' }, formula.description)])]),
      ul({ class: 'summary-list' }, formula.groups.map((group) => li([
        span({ class: 'muted' }, categoryName(categories, group.categoryId)),
        span(function* () {
          const names = (yield* picksOf(group.id)).map((id) => products.find((product) => product.id === id)?.name ?? id);
          if (names.length) return names.join(', ');
          return group.min === 0 ? 'Sans' : 'À choisir';
        }),
      ]))),
      div({ class: 'summary-total' }, [span('Prix de la formule'), strong(euros(formula.price))]),
      button('add-formula', { type: 'button', class: 'button button-block', disabled: function* () { return !(yield* isComplete()); }, *click() {
        const picks = (yield* shopUi.formulaPicks())[formula.id] ?? {};
        yield* cart.cartLines.add({ productId: formula.id, quantity: 1, selections: formula.groups.map((group) => ({ groupId: group.id, productIds: [...(picks[group.id] ?? [])] })) });
        yield* shopUi.formulaPicks.forget(formula.id);
        yield* CraftRouter.navigate({ to: 'panier' });
      } }, function* () { return (yield* isComplete()) ? `Ajouter au panier · ${euros(formula.price)}` : 'Complétez vos choix'; }),
      p({ class: 'muted small' }, 'Les éléments choisis sont inclus dans le prix de la formule.'),
    ]),
  ]);
});

const FormulaPage = craftComponent('EcommerceFormulaPage', { providers: [provideStorefrontView(), provideProductView()] }, function* () {
  const { storeQuery } = yield* StorefrontView();
  return main([
    a('formula-back', { class: 'text-link back-link' }, '← La boutique').pipe(CraftRouterLink({ to: 'catalogue' })),
    span({ class: 'eyebrow' }, 'À composer'), heading({ class: 'page-title' }, 'Composez votre formule'),
    p({ class: 'subtitle' }, 'Choisissez chaque élément, le récapitulatif se met à jour au fil de vos choix.'),
    ifNode(storeQuery.isLoading, () => div({ class: 'panel skeleton tall' }), () => headingSection(FormulaComposer())),
  ]);
});

function selectionSummary(line: CartLine, product: Product | undefined, products: readonly Product[]): string {
  if (product?.kind !== 'formule' || !line.selections) return product?.kind === 'simple' ? euros(product.price) + ' l’unité' : '';
  const names = line.selections.flatMap((selection) => selection.productIds).map((id) => products.find((item) => item.id === id)?.name ?? id);
  return names.length ? names.join(' · ') : 'Formule sans accompagnement';
}
const cartTotal = (lines: readonly CartLine[], products: readonly Product[]) =>
  lines.reduce((sum, line) => sum + (products.find((product) => product.id === line.productId)?.price ?? 0) * line.quantity, 0);

const CartPage = craftComponent('EcommerceCartPage', { providers: [provideStorefrontView()] }, function* () {
  const { storeQuery } = yield* StorefrontView();
  const cart = yield* Cart();
  const productOf = function* (line: Read<CartLine>) { const value = yield* line(); return (yield* storeQuery.products()).find((product) => product.id === value.productId); };
  return main([
    span({ class: 'eyebrow' }, 'Avant de se régaler'), heading({ class: 'page-title' }, 'Votre panier'),
    ifNode('cart-empty', function* () { return (yield* cart.cartCount()) === 0; },
      () => div({ class: 'empty-state' }, [span({ class: 'empty-emoji', 'aria-hidden': 'true' }, '🧺'), heading({ level: 2 }, 'Votre panier est encore vide'), p({ class: 'muted' }, 'Un croissant, un flat white ? On vous attend.'), a('empty-shop', { class: 'button' }, 'Voir la boutique').pipe(CraftRouterLink({ to: 'catalogue' }))]),
      () => div({ class: 'cart-layout' }, [
        div({ class: 'cart-lines' }, forNode(cart.cartLines, { track: (line) => lineKey(line) }, (line) => article({ class: 'cart-line' }, [
          productVisual(function* () { return yield* productOf(line); }, 'thumb'),
          div({ class: 'cart-line-info' }, [
            strong(function* () { return (yield* productOf(line))?.name ?? 'Produit retiré de la carte'; }),
            span({ class: 'muted' }, function* () { return selectionSummary(yield* line(), yield* productOf(line), yield* storeQuery.products()); }),
            div({ class: 'stepper', 'data-size': 'compact' }, [
              button('line-decrease', { type: 'button', class: 'stepper-button', 'aria-label': 'Retirer un exemplaire', *click() { yield* cart.cartLines.shift(lineKey(yield* line()), -1); } }, '−'),
              span({ class: 'stepper-value' }, function* () { return String((yield* line()).quantity); }),
              button('line-increase', { type: 'button', class: 'stepper-button', 'aria-label': 'Ajouter un exemplaire', disabled: function* () { const product = yield* productOf(line); return product?.kind === 'simple' && quantityInCart(yield* cart.cartLines(), product.id) >= product.stock; }, *click() { yield* cart.cartLines.shift(lineKey(yield* line()), 1); } }, '+'),
            ]),
          ]),
          div({ class: 'cart-line-end' }, [
            span({ class: 'price' }, function* () { return euros(((yield* productOf(line))?.price ?? 0) * (yield* line()).quantity); }),
            button('remove-line', { type: 'button', class: 'icon-button', 'aria-label': 'Retirer du panier', *click() { yield* cart.cartLines.remove(lineKey(yield* line())); } }, '✕'),
          ]),
        ]))),
        aside({ class: 'summary' }, [
          heading({ level: 2, class: 'summary-title' }, 'Récapitulatif'),
          div({ class: 'summary-row' }, [span(function* () { return `Sous-total · ${yield* cart.cartCount()} article(s)`; }), span(function* () { return euros(cartTotal(yield* cart.cartLines(), yield* storeQuery.products())); })]),
          div({ class: 'summary-row' }, [span('Retrait en boutique'), span({ class: 'free' }, 'Offert')]),
          div({ class: 'summary-total' }, [span('Total'), strong(function* () { return euros(cartTotal(yield* cart.cartLines(), yield* storeQuery.products())); })]),
          a('to-checkout', { class: 'button button-block' }, 'Passer commande →').pipe(CraftRouterLink({ to: 'paiement' })),
          a('continue-shopping', { class: 'text-link center' }, 'Continuer mes achats').pipe(CraftRouterLink({ to: 'catalogue' })),
        ]),
      ])),
  ]);
});

const CheckoutPage = craftComponent('EcommerceCheckoutPage', { providers: [provideStorefrontView()] }, function* () {
  const { storeQuery, placeOrderProcess } = yield* StorefrontView();
  const cart = yield* Cart();
  const placedOrder = yield* craftComputed('placedOrder', function* () { const result = yield* placeOrderProcess.value(); return result && !isCraftException(result) ? result : undefined; });
  return main([
    ifNode('order-placed', function* () { return (yield* placedOrder()) !== undefined; },
      () => div({ class: 'empty-state success' }, [
        span({ class: 'empty-emoji', 'aria-hidden': 'true' }, '🎉'),
        span({ class: 'eyebrow' }, 'Merci pour votre commande'),
        heading({ class: 'page-title' }, 'C’est tout bon !'),
        p({ class: 'lead' }, function* () { const order = yield* placedOrder(); return order ? `Commande ${order.id.slice(-5).toUpperCase()} · ${euros(order.total)}. Elle vous attend au comptoir.` : ''; }),
        a('confirmation-shop', { class: 'button' }, 'Revenir à la boutique').pipe(CraftRouterLink({ to: 'catalogue' })),
      ]),
      () => div([
        span({ class: 'eyebrow' }, 'Paiement fictif'), heading({ class: 'page-title' }, 'On y est presque'),
        p({ class: 'subtitle' }, 'Aucune donnée bancaire n’est demandée. Le stock est revérifié au moment de confirmer.'),
        div({ class: 'cart-layout' }, [
          div({ class: 'panel' }, [
            heading({ level: 2, class: 'summary-title' }, 'Retrait au comptoir'),
            p({ class: 'muted' }, 'atelier. · 12 rue des Lilas · ouvert de 7 h à 19 h. Votre commande est prête en 15 minutes.'),
            ul({ class: 'checkout-lines' }, forNode(cart.cartLines, { track: (line) => lineKey(line), empty: () => li({ class: 'muted' }, 'Votre panier est vide.') }, (line) => li([
              span(function* () { const value = yield* line(); const product = (yield* storeQuery.products()).find((item) => item.id === value.productId); return `${value.quantity} × ${product?.name ?? 'Produit retiré'}`; }),
              span({ class: 'price' }, function* () { const value = yield* line(); const product = (yield* storeQuery.products()).find((item) => item.id === value.productId); return euros((product?.price ?? 0) * value.quantity); }),
            ]))),
          ]),
          aside({ class: 'summary' }, [
            div({ class: 'summary-total' }, [span('À régler au comptoir'), strong(function* () { return euros(cartTotal(yield* cart.cartLines(), yield* storeQuery.products())); })]),
            button('confirm-order', { type: 'button', class: 'button button-block', disabled: function* () { return (yield* placeOrderProcess.isLoading()) || (yield* cart.cartCount()) === 0; }, *click() {
              const lines = yield* cart.cartLines();
              if (lines.length) yield* placeOrderProcess.call(lines);
            } }, function* () { return (yield* placeOrderProcess.isLoading()) ? 'Validation…' : 'Confirmer la commande'; }),
            ifNode(placeOrderProcess.hasException, () => p({ class: 'notice error' }, function* () { return failureOf(yield* placeOrderProcess.exception())?.message ?? 'La commande n’a pas pu être validée. Vérifiez le stock et réessayez.'; })),
            a('cancel-checkout', { class: 'text-link center' }, '← Retour au panier').pipe(CraftRouterLink({ to: 'panier' })),
          ]),
        ]),
      ])),
  ]);
});

export { HomePage, CataloguePage, ProductPage, FormulaPage, CartPage, CheckoutPage };
