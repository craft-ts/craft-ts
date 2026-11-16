import { a, article, aside, button, craftComponent, div, forNode, heading, headingSection, ifNode, input, li, main, p, section, span, strong, ul } from '@craft-ts/component';
import { CraftRouter, CraftRouterLink, craftComputed, craftService, craftSleep, craftUse, isCraftException, query } from '@craft-ts/core';
import { catalog, placeOrder, searchCatalog } from './api';
import { categoryName, categoryTone, euros, eventValue, failureOf, groupRule, lineKey, productEmoji, stockLabel } from './shop-format';
import { ProductIdPathParams } from './product-id-path-params';
import { Cart, PromoClock, ShopUi, quantityInCart } from './shop-state';
import type { Catalog, CartLine, Category, Product } from '../shared/model';
import { isPromoted, isPromotionActive, promotedPrice, promotionCountdown, type Promotion } from '../shared/promotion';
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
  yield* query('storeQuery', {
    params: () => true,
    loader: loadStore,
  }, ({ resource }) => ({
    products: craftUse(craftComputed('storeProducts', function* () { return (yield* resource.value())?.products ?? []; })),
    simpleProducts: craftUse(craftComputed('storeSimpleProducts', function* () { return ((yield* resource.value())?.products ?? []).filter((product) => product.kind === 'simple'); })),
    featuredProducts: craftUse(craftComputed('featuredProducts', function* () {
      const products = (yield* resource.value())?.products ?? [];
      return [...products.filter((product) => product.kind === 'formule'), ...products.filter((product) => product.kind === 'simple' && product.stock > 0)].slice(0, 3);
    })),
    categories: craftUse(craftComputed('storeCategories', function* () { return (yield* resource.value())?.categories ?? []; })),
    promotion: craftUse(craftComputed('storePromotion', function* () { return (yield* resource.value())?.promotion; })),
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

export const { SearchView, provideSearchView } = craftService({ name: 'searchView', providedIn: 'toProvide' }, function* () {
  const shopUi = yield* ShopUi();
  yield* query('searchQuery', {
    params: function* () { return (yield* shopUi.searchTerm()).trim(); },
    loader: function* ({ params: search }) {
      if (!search) return [] as Product[];
      yield* craftSleep(300, { owner: 'catalog-search' });
      try { return yield* searchCatalog({ query: search }); }
      catch { return [] as Product[]; }
    },
  });
});

/** La fiche ouverte, suivie depuis l'URL : passer d'un produit à l'autre réutilise la même page. */
export const { ProductView, provideProductView } = craftService({ name: 'productView', providedIn: 'toProvide' }, function* () {
  const { storeQuery } = yield* StorefrontView();
  const productId = yield* ProductIdPathParams();
  const shopUi = yield* ShopUi();
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
  yield* craftComputed('categoryLabel', function* () {
    const current = yield* currentProduct();
    return current ? categoryName(yield* storeQuery.categories(), current.categoryId) : '';
  });
  yield* craftComputed('stockLevel', function* () {
    const current = yield* currentProduct();
    if (current?.kind !== 'simple') return undefined;
    return current.stock <= 0 ? 'out' : current.stock <= 3 ? 'low' : 'ok';
  });
  yield* craftComputed('stockLabel', function* () {
    const current = yield* currentProduct();
    return current?.kind === 'simple' ? stockLabel(current.stock) : 'Formule à composer';
  });
  yield* craftComputed('formulaGroupsLabel', function* () {
    const current = yield* currentProduct();
    if (current?.kind !== 'formule') return '';
    const categories = yield* storeQuery.categories();
    return current.groups.map((group) => `${categoryName(categories, group.categoryId)} · ${groupRule(group)}`).join('  ·  ');
  });
  yield* craftComputed('formulaDisplayGroups', function* () {
    const current = yield* currentProduct();
    if (current?.kind !== 'formule') return [];
    const products = yield* storeQuery.simpleProducts();
    const categories = yield* storeQuery.categories();
    const picksByGroup = (yield* shopUi.formulaPicks())[current.id] ?? {};
    return current.groups.map((group) => {
      const picks = picksByGroup[group.id] ?? [];
      const options = products
        .filter((item) => item.categoryId === group.categoryId)
        .map((item) => ({
          item,
          selected: picks.includes(item.id),
          disabled: item.stock <= 0 || (group.max > 1 && picks.length >= group.max && !picks.includes(item.id)),
          tone: categoryTone(item.categoryId),
          emoji: productEmoji(item),
          stockText: item.stock > 0 ? `Inclus · ${stockLabel(item.stock).toLowerCase()}` : 'Épuisé',
        }));
      const names = picks.map((id) => products.find((item) => item.id === id)?.name ?? id);
      return {
        group,
        categoryLabel: categoryName(categories, group.categoryId),
        ruleLabel: groupRule(group),
        statusLabel: `${picks.length} / ${group.max}`,
        isComplete: picks.length >= group.min && picks.length <= group.max,
        selectionLabel: names.length ? names.join(', ') : group.min === 0 ? 'Sans' : 'À choisir',
        options,
      };
    });
  });
  yield* craftComputed('formulaIsComplete', function* () {
    const current = yield* currentProduct();
    if (current?.kind !== 'formule') return false;
    const picks = (yield* shopUi.formulaPicks())[current.id] ?? {};
    return current.groups.every((group) => {
      const count = picks[group.id]?.length ?? 0;
      return count >= group.min && count <= group.max;
    });
  });
  yield* craftComputed('formulaPriceLabel', function* () {
    const current = yield* currentProduct();
    return current?.kind === 'formule' ? euros(current.price) : '';
  });
  yield* craftComputed('formulaButtonLabel', function* () {
    const current = yield* currentProduct();
    if (current?.kind !== 'formule') return 'Complétez vos choix';
    const picks = (yield* shopUi.formulaPicks())[current.id] ?? {};
    const complete = current.groups.every((group) => {
      const count = picks[group.id]?.length ?? 0;
      return count >= group.min && count <= group.max;
    });
    return complete ? `Ajouter au panier · ${euros(current.price)}` : 'Complétez vos choix';
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

/** Le prix d'un produit à l'heure de la vitrine : remisé tant que la promotion court. */
interface Pricing {
  readonly price: (product: Product) => Generator<unknown, number, unknown>;
  readonly promoted: (product: Product) => Generator<unknown, boolean, unknown>;
  readonly total: (lines: readonly CartLine[]) => Generator<unknown, number, unknown>;
}
function pricingOf(promotion: Read<Promotion | undefined>, products: Read<readonly Product[]>, now: Read<number>): Pricing {
  return {
    price: function* (product) { return promotedPrice(product, yield* promotion(), yield* now()); },
    promoted: function* (product) { return isPromoted(product, yield* promotion(), yield* now()); },
    total: function* (lines) {
      const promo = yield* promotion();
      const at = yield* now();
      const catalogue = yield* products();
      return lines.reduce((sum, line) => {
        const product = catalogue.find((item) => item.id === line.productId);
        return sum + (product ? promotedPrice(product, promo, at) : 0) * line.quantity;
      }, 0);
    },
  };
}

/** La promotion de la semaine et le temps qu'il lui reste, à la seconde. */
function promoBanner(promotion: Read<Promotion | undefined>, categories: Read<readonly Category[]>, now: Read<number>) {
  const active = function* () { return isPromotionActive(yield* promotion(), yield* now()); };
  return ifNode('promo-banner', function* () { return (yield* promotion()) !== undefined; }, () =>
    aside({ class: 'promo-banner', 'aria-label': 'Promotion de la semaine', 'data-state': function* () { return (yield* active()) ? 'active' : 'ended'; } }, [
      span({ class: 'promo-emoji', 'aria-hidden': 'true' }, '🥐'),
      div({ class: 'promo-copy' }, [
        strong(function* () { return (yield* promotion())?.title ?? ''; }),
        span(function* () {
          const value = yield* promotion();
          return value ? `−${value.percentOff} % sur toutes les ${categoryName(yield* categories(), value.categoryId).toLowerCase()}` : '';
        }),
      ]),
      div({ class: 'promo-timer', role: 'timer' }, [
        span({ class: 'promo-label' }, function* () { return (yield* active()) ? 'Se termine dans' : 'La promotion est'; }),
        span({ class: 'promo-countdown' }, function* () { const value = yield* promotion(); return value ? promotionCountdown(value, yield* now()) : ''; }),
      ]),
    ]));
}

/** Le prix, et le prix de carte barré quand il est remisé. */
function priceTag(pricing: Pricing, product: Read<Product | undefined>, size: 'card' | 'large') {
  return span({ class: 'price-tag' }, [
    ifNode('promo-was', function* () { const value = yield* product(); return value !== undefined && (yield* pricing.promoted(value)); },
      () => span({ class: 'price-was' }, function* () { const value = yield* product(); return value ? euros(value.price) : ''; })),
    span({ class: size === 'large' ? 'price large' : 'price', 'data-promo': function* () { const value = yield* product(); return value && (yield* pricing.promoted(value)) ? 'true' : undefined; } },
      function* () { const value = yield* product(); return value ? euros(yield* pricing.price(value)) : ''; }),
  ]);
}

function productVisual(product: Read<Product | undefined>, size: 'card' | 'hero' | 'thumb') {
  return div({ class: 'visual', 'data-size': size, 'data-tone': function* () { const value = yield* product(); return value ? categoryTone(value.categoryId) : 'sage'; } }, [
    span({ class: 'visual-emoji', 'aria-hidden': 'true' }, function* () { const value = yield* product(); return value ? productEmoji(value) : '🍽️'; }),
  ]);
}

/**
 * Le bouton « Ajouter » devient un sélecteur de quantité dès que le produit est
 * dans le panier : on voit ce qu'on a déjà pris, et on ajuste sans quitter la page.
 */
function addToCartControl(cart: CartApi, pricing: Pricing, product: Read<Product | undefined>, size: 'compact' | 'large') {
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
    return size === 'large' ? `Ajouter au panier · ${euros(yield* pricing.price(value))}` : '+ Ajouter';
  }));
}

function productCard(cart: CartApi, pricing: Pricing, categories: Read<readonly Category[]>, product: Read<Product>) {
  const openProduct = function* () { yield* goToProduct(yield* product()); };
  return article({ class: 'card', 'data-sold-out': function* () { return isAvailable(yield* product()) ? undefined : 'true'; } }, [
    button('open-visual', { type: 'button', class: 'card-visual', 'aria-label': function* () { return `Voir ${(yield* product()).name}`; }, click: openProduct }, [
      productVisual(product, 'card'),
      ifNode('formula-tag', function* () { return (yield* product()).kind === 'formule'; }, () => span({ class: 'corner-tag' }, 'À composer')),
      ifNode('promo-tag', function* () { return yield* pricing.promoted(yield* product()); }, () => span({ class: 'corner-tag', 'data-tone': 'promo' }, 'Promo')),
      ifNode('formula-count', function* () { const value = yield* product(); return value.kind === 'formule' && quantityInCart(yield* cart.cartLines(), value.id) > 0; },
        () => span({ class: 'corner-tag', 'data-tone': 'ink' }, function* () { return `${quantityInCart(yield* cart.cartLines(), (yield* product()).id)} au panier`; })),
    ]),
    div({ class: 'card-body' }, [
      span({ class: 'badge' }, function* () { return categoryName(yield* categories(), (yield* product()).categoryId); }),
      button('open-title', { type: 'button', class: 'card-title', click: openProduct }, function* () { return (yield* product()).name; }),
      p({ class: 'card-text' }, function* () { return (yield* product()).description; }),
      div({ class: 'card-foot' }, [
        div([
          priceTag(pricing, product, 'card'),
          span({ class: 'stock-hint', 'data-level': function* () { const value = yield* product(); return value.kind === 'simple' && value.stock <= 3 ? 'low' : undefined; } }, function* () { const value = yield* product(); return value.kind === 'simple' ? stockLabel(value.stock) : 'Formule'; }),
        ]),
        addToCartControl(cart, pricing, product, 'compact'),
      ]),
    ]),
  ]);
}

const HomePage = craftComponent('EcommerceHomePage', { providers: [provideStorefrontView()] }, function* () {
  const { storeQuery } = yield* StorefrontView();
  const cart = yield* Cart();
  const { promoNow } = yield* PromoClock();
  const pricing = pricingOf(storeQuery.promotion, storeQuery.products, promoNow);
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
    promoBanner(storeQuery.promotion, storeQuery.categories, promoNow),
    ul({ class: 'perks' }, [
      li([strong('Préparé le matin même'), span('Viennoiseries sorties du four à 7 h.')]),
      li([strong('Retrait offert'), span('Votre commande vous attend au comptoir.')]),
      li([strong('Formules sur mesure'), span('Vous choisissez chaque élément.')]),
    ]),
    div({ class: 'section-head' }, [div([span({ class: 'eyebrow' }, 'À la carte'), heading({ level: 2, class: 'section-title' }, 'Les incontournables')]), a('home-all', { class: 'text-link' }, 'Tout voir →').pipe(CraftRouterLink({ to: 'catalogue' }))]),
    div({ class: 'grid' }, forNode(storeQuery.featuredProducts, { track: (product) => product.id }, (product) => productCard(cart, pricing, storeQuery.categories, product))),
  ]);
});

const CataloguePage = craftComponent('EcommerceCataloguePage', { providers: [provideStorefrontView(), provideSearchView()] }, function* () {
  const { storeQuery } = yield* StorefrontView();
  const { searchQuery } = yield* SearchView();
  const cart = yield* Cart();
  const shopUi = yield* ShopUi();
  const { promoNow } = yield* PromoClock();
  const pricing = pricingOf(storeQuery.promotion, storeQuery.products, promoNow);
  const visibleProducts = yield* craftComputed('visibleProducts', function* () {
    const filter = yield* shopUi.categoryFilter();
    const search = (yield* shopUi.searchTerm()).trim();
    const source = search ? (yield* searchQuery.value()) ?? [] : yield* storeQuery.products();
    const products = source.filter((product) => filter === 'all' || product.categoryId === filter);
    // Les produits épuisés restent visibles, en fin de liste, pour qu'on sache qu'ils reviendront.
    return [...products.filter(isAvailable), ...products.filter((product) => !isAvailable(product))];
  });
  return main([
    div({ class: 'page-head' }, [
      div([span({ class: 'eyebrow' }, 'Le comptoir'), heading({ class: 'page-title' }, 'La boutique'), p({ class: 'subtitle' }, 'Tout est préparé avec soin. Ajoutez, ajustez les quantités, le panier suit.')]),
      input('catalog-search', { type: 'search', 'aria-label': 'Rechercher un produit', placeholder: 'Rechercher un produit', value: function* () { return yield* shopUi.searchTerm(); }, input(event) { const value = eventValue(event); return shopUi.searchTerm.search(value); } }),
    ]),
    promoBanner(storeQuery.promotion, storeQuery.categories, promoNow),
    div({ class: 'chips', role: 'toolbar', 'aria-label': 'Filtrer par catégorie' }, [
      button('filter-all', { type: 'button', class: 'chip', 'aria-pressed': function* () { return (yield* shopUi.categoryFilter()) === 'all' ? 'true' : 'false'; }, *click() { yield* shopUi.categoryFilter.choose('all'); } }, 'Tout'),
      forNode(storeQuery.categories, { track: (category) => category.id }, (category) =>
        button('filter-category', { type: 'button', class: 'chip', 'aria-pressed': function* () { return (yield* shopUi.categoryFilter()) === (yield* category()).id ? 'true' : 'false'; }, *click() { yield* shopUi.categoryFilter.choose((yield* category()).id); } }, function* () { return (yield* category()).name; })),
    ]),
    ifNode(storeQuery.isLoading, () => div({ class: 'grid' }, [div({ class: 'card skeleton' }), div({ class: 'card skeleton' }), div({ class: 'card skeleton' })]),
      () => div({ class: 'grid' }, forNode(visibleProducts, { track: (product) => product.id, empty: () => p({ class: 'empty-note' }, 'Rien dans cette catégorie pour le moment.') }, (product) => productCard(cart, pricing, storeQuery.categories, product)))),
  ]);
});

const ProductPage = craftComponent('EcommerceProductPage', { providers: [provideStorefrontView(), provideProductView()] }, function* () {
  const { storeQuery } = yield* StorefrontView();
  const { currentProduct: product, relatedProducts, categoryLabel, stockLevel, stockLabel: productStockLabel, formulaGroupsLabel } = yield* ProductView();
  const cart = yield* Cart();
  const { promoNow } = yield* PromoClock();
  const pricing = pricingOf(storeQuery.promotion, storeQuery.products, promoNow);
  return main([
    a('back-catalog', { class: 'text-link back-link' }, '← La boutique').pipe(CraftRouterLink({ to: 'catalogue' })),
    ifNode(storeQuery.isLoading, () => div({ class: 'product-layout' }, [div({ class: 'visual skeleton', 'data-size': 'hero' }), div({ class: 'panel skeleton' })]),
      () => ifNode('product-found', function* () { return (yield* product()) !== undefined; },
        () => div({ class: 'product-layout' }, [
          productVisual(product, 'hero'),
          section({ class: 'product-info' }, [
            span({ class: 'badge' }, categoryLabel),
            heading({ class: 'page-title' }, function* () { return (yield* product())?.name ?? ''; }),
            p({ class: 'lead' }, function* () { return (yield* product())?.description ?? ''; }),
            div({ class: 'price-row' }, [
              priceTag(pricing, product, 'large'),
              span({ class: 'stock-hint', 'data-level': stockLevel }, productStockLabel),
            ]),
            ifNode('formula-groups', function* () { return (yield* product())?.kind === 'formule'; }, () => ul({ class: 'formula-rules' }, formulaGroupsLabel)),
            addToCartControl(cart, pricing, product, 'large'),
            ul({ class: 'reassurance' }, [li('🕖 Préparé le matin même'), li('🛍 Retrait offert au comptoir'), li('🔒 Paiement de démonstration, sans carte')]),
          ]),
        ]),
        () => div({ class: 'empty-state' }, [span({ class: 'empty-emoji', 'aria-hidden': 'true' }, '🫙'), heading({ level: 2 }, 'Produit introuvable'), p({ class: 'muted' }, 'Il a peut-être quitté la carte. Jetez un œil au reste de la boutique.'), a('missing-shop', { class: 'button' }, 'Voir la boutique').pipe(CraftRouterLink({ to: 'catalogue' }))]))),
    ifNode('has-related', function* () { return (yield* relatedProducts()).length > 0; }, () => section({ class: 'related' }, [
      div({ class: 'section-head' }, [heading({ level: 2, class: 'section-title' }, 'Vous aimerez aussi')]),
      div({ class: 'grid' }, forNode(relatedProducts, { track: (item) => item.id }, (item) => productCard(cart, pricing, storeQuery.categories, item))),
    ])),
  ]);
});

const FormulaComposer = craftComponent('EcommerceFormulaComposer', {}, function* () {
  const cart = yield* Cart();
  const shopUi = yield* ShopUi();
  const { currentProduct, formulaDisplayGroups, formulaIsComplete, formulaPriceLabel, formulaButtonLabel } = yield* ProductView();
  const formula = yield* currentProduct();
  if (!formula || formula.kind !== 'formule') return div({ class: 'empty-state' }, [heading({ level: 2 }, 'Cette formule est introuvable.'), a('missing-formula-shop', { class: 'button' }, 'Voir la boutique').pipe(CraftRouterLink({ to: 'catalogue' }))]);
  const displayGroups = yield* formulaDisplayGroups();
  return div({ class: 'composer' }, [
    div({ class: 'composer-steps' }, displayGroups.map((displayGroup, index) => {
      const { group } = displayGroup;
      return section({ class: 'step' }, [
        div({ class: 'step-head' }, [
          span({ class: 'step-number' }, String(index + 1)),
          div([heading({ level: 2, class: 'step-title' }, `Choisissez : ${displayGroup.categoryLabel.toLowerCase()}`), span({ class: 'muted' }, displayGroup.ruleLabel)]),
          span({ class: 'step-status', 'data-done': displayGroup.isComplete ? 'true' : undefined }, displayGroup.statusLabel),
        ]),
        div({ class: 'options' }, [...displayGroup.options.map((option) => button('formula-choice', {
          type: 'button',
          class: 'option',
          'aria-pressed': option.selected ? 'true' : 'false',
          disabled: option.disabled,
          *click() { yield* shopUi.formulaPicks.toggle(formula.id, group, option.item.id); },
        }, [
          span({ class: 'option-emoji', 'data-tone': option.tone, 'aria-hidden': 'true' }, option.emoji),
          span({ class: 'option-text' }, [strong(option.item.name), span({ class: 'muted' }, option.stockText)]),
          span({ class: 'option-check', 'aria-hidden': 'true' }, '✓'),
        ])), ...(displayGroup.options.length ? [] : [p({ class: 'muted' }, 'Aucun produit disponible dans cette catégorie.')])]),
      ]);
    })),
    aside({ class: 'summary' }, [
      div({ class: 'summary-head' }, [span({ class: 'summary-emoji', 'data-tone': categoryTone(formula.categoryId), 'aria-hidden': 'true' }, productEmoji(formula)), div([strong(formula.name), p({ class: 'muted' }, formula.description)])]),
      ul({ class: 'summary-list' }, displayGroups.map((displayGroup) => li([
        span({ class: 'muted' }, displayGroup.categoryLabel),
        span(displayGroup.selectionLabel),
      ]))),
      div({ class: 'summary-total' }, [span('Prix de la formule'), strong(formulaPriceLabel)]),
      button('add-formula', { type: 'button', class: 'button button-block', disabled: function* () { return !(yield* formulaIsComplete()); }, *click() {
        const picks = (yield* shopUi.formulaPicks())[formula.id] ?? {};
        yield* cart.cartLines.add({ productId: formula.id, quantity: 1, selections: formula.groups.map((group) => ({ groupId: group.id, productIds: [...(picks[group.id] ?? [])] })) });
        yield* shopUi.formulaPicks.forget(formula.id);
        yield* CraftRouter.navigate({ to: 'panier' });
      } }, formulaButtonLabel),
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

function selectionSummary(line: CartLine, product: Product | undefined, products: readonly Product[], unitPrice: number): string {
  if (product?.kind !== 'formule' || !line.selections) return product?.kind === 'simple' ? euros(unitPrice) + ' l’unité' : '';
  const names = line.selections.flatMap((selection) => selection.productIds).map((id) => products.find((item) => item.id === id)?.name ?? id);
  return names.length ? names.join(' · ') : 'Formule sans accompagnement';
}

export const { CartPageView, provideCartPageView } = craftService({ name: 'cartPageView', providedIn: 'toProvide' }, function* () {
  const { storeQuery } = yield* StorefrontView();
  const cart = yield* Cart();
  const { promoNow } = yield* PromoClock();
  const pricing = pricingOf(storeQuery.promotion, storeQuery.products, promoNow);
  yield* craftComputed('displayLines', function* () {
    const lines = yield* cart.cartLines();
    const products = yield* storeQuery.products();
    const result = [];
    for (const line of lines) {
      const product = products.find((item) => item.id === line.productId);
      const unitPrice = product ? yield* pricing.price(product) : 0;
      result.push({
        line,
        product,
        summaryLabel: selectionSummary(line, product, products, unitPrice),
        quantity: line.quantity,
        cannotIncrease: product?.kind === 'simple' && quantityInCart(lines, product.id) >= product.stock,
        totalLabel: euros(unitPrice * line.quantity),
      });
    }
    return result;
  });
  yield* craftComputed('subtotalLabel', function* () {
    return euros(yield* pricing.total(yield* cart.cartLines()));
  });
  yield* craftComputed('countLabel', function* () {
    return `Sous-total · ${yield* cart.cartCount()} article(s)`;
  });
});

const CartPage = craftComponent('EcommerceCartPage', { providers: [provideStorefrontView(), provideCartPageView()] }, function* () {
  const cart = yield* Cart();
  const cartPage = yield* CartPageView();
  return main([
    span({ class: 'eyebrow' }, 'Avant de se régaler'), heading({ class: 'page-title' }, 'Votre panier'),
    ifNode('cart-empty', function* () { return (yield* cart.cartCount()) === 0; },
      () => div({ class: 'empty-state' }, [span({ class: 'empty-emoji', 'aria-hidden': 'true' }, '🧺'), heading({ level: 2 }, 'Votre panier est encore vide'), p({ class: 'muted' }, 'Un croissant, un flat white ? On vous attend.'), a('empty-shop', { class: 'button' }, 'Voir la boutique').pipe(CraftRouterLink({ to: 'catalogue' }))]),
      () => div({ class: 'cart-layout' }, [
        div({ class: 'cart-lines' }, forNode(cartPage.displayLines, { track: (line) => lineKey(line.line) }, (line) => article({ class: 'cart-line' }, [
          productVisual(function* () { return (yield* line()).product; }, 'thumb'),
          div({ class: 'cart-line-info' }, [
            strong(function* () { return (yield* line()).product?.name ?? 'Produit retiré de la carte'; }),
            span({ class: 'muted' }, function* () { return (yield* line()).summaryLabel; }),
            div({ class: 'stepper', 'data-size': 'compact' }, [
              button('line-decrease', { type: 'button', class: 'stepper-button', 'aria-label': 'Retirer un exemplaire', *click() { yield* cart.cartLines.shift(lineKey((yield* line()).line), -1); } }, '−'),
              span({ class: 'stepper-value' }, function* () { return String((yield* line()).quantity); }),
              button('line-increase', { type: 'button', class: 'stepper-button', 'aria-label': 'Ajouter un exemplaire', disabled: function* () { return (yield* line()).cannotIncrease; }, *click() { yield* cart.cartLines.shift(lineKey((yield* line()).line), 1); } }, '+'),
            ]),
          ]),
          div({ class: 'cart-line-end' }, [
            span({ class: 'price' }, function* () { return (yield* line()).totalLabel; }),
            button('remove-line', { type: 'button', class: 'icon-button', 'aria-label': 'Retirer du panier', *click() { yield* cart.cartLines.remove(lineKey((yield* line()).line)); } }, '✕'),
          ]),
        ]))),
        aside({ class: 'summary' }, [
          heading({ level: 2, class: 'summary-title' }, 'Récapitulatif'),
          div({ class: 'summary-row' }, [span(cartPage.countLabel), span(cartPage.subtotalLabel)]),
          div({ class: 'summary-row' }, [span('Retrait en boutique'), span({ class: 'free' }, 'Offert')]),
          div({ class: 'summary-total' }, [span('Total'), strong(cartPage.subtotalLabel)]),
          a('to-checkout', { class: 'button button-block' }, 'Passer commande →').pipe(CraftRouterLink({ to: 'paiement' })),
          a('continue-shopping', { class: 'text-link center' }, 'Continuer mes achats').pipe(CraftRouterLink({ to: 'catalogue' })),
        ]),
      ])),
  ]);
});

export const { CheckoutPageView, provideCheckoutPageView } = craftService({ name: 'checkoutPageView', providedIn: 'toProvide' }, function* () {
  const { storeQuery, placeOrderProcess } = yield* StorefrontView();
  const cart = yield* Cart();
  const { promoNow } = yield* PromoClock();
  const pricing = pricingOf(storeQuery.promotion, storeQuery.products, promoNow);
  const placedOrder = yield* craftComputed('placedOrder', function* () { const result = yield* placeOrderProcess.value(); return result && !isCraftException(result) ? result : undefined; });
  yield* craftComputed('confirmationLabel', function* () {
    const order = yield* placedOrder();
    return order ? `Commande ${order.id.slice(-5).toUpperCase()} · ${euros(order.total)}. Elle vous attend au comptoir.` : '';
  });
  yield* craftComputed('checkoutLines', function* () {
    const lines = yield* cart.cartLines();
    const products = yield* storeQuery.products();
    const result = [];
    for (const line of lines) {
      const product = products.find((item) => item.id === line.productId);
      const unitPrice = product ? yield* pricing.price(product) : 0;
      result.push({
        line,
        nameLabel: `${line.quantity} × ${product?.name ?? 'Produit retiré'}`,
        totalLabel: euros(unitPrice * line.quantity),
      });
    }
    return result;
  });
  yield* craftComputed('totalLabel', function* () {
    return euros(yield* pricing.total(yield* cart.cartLines()));
  });
  yield* craftComputed('confirmDisabled', function* () {
    return (yield* placeOrderProcess.isLoading()) || (yield* cart.cartCount()) === 0;
  });
  yield* craftComputed('confirmLabel', function* () {
    return (yield* placeOrderProcess.isLoading()) ? 'Validation…' : 'Confirmer la commande';
  });
  yield* craftComputed('failureLabel', function* () {
    return failureOf(yield* placeOrderProcess.exception())?.message ?? 'La commande n’a pas pu être validée. Vérifiez le stock et réessayez.';
  });
});

const CheckoutPage = craftComponent('EcommerceCheckoutPage', { providers: [provideStorefrontView(), provideCheckoutPageView()] }, function* () {
  const { placeOrderProcess } = yield* StorefrontView();
  const cart = yield* Cart();
  const checkout = yield* CheckoutPageView();
  return main([
    ifNode('order-placed', function* () { return (yield* checkout.placedOrder()) !== undefined; },
      () => div({ class: 'empty-state success' }, [
        span({ class: 'empty-emoji', 'aria-hidden': 'true' }, '🎉'),
        span({ class: 'eyebrow' }, 'Merci pour votre commande'),
        heading({ class: 'page-title' }, 'C’est tout bon !'),
        p({ class: 'lead' }, checkout.confirmationLabel),
        a('confirmation-shop', { class: 'button' }, 'Revenir à la boutique').pipe(CraftRouterLink({ to: 'catalogue' })),
      ]),
      () => div([
        span({ class: 'eyebrow' }, 'Paiement fictif'), heading({ class: 'page-title' }, 'On y est presque'),
        p({ class: 'subtitle' }, 'Aucune donnée bancaire n’est demandée. Le stock est revérifié au moment de confirmer.'),
        div({ class: 'cart-layout' }, [
          div({ class: 'panel' }, [
            heading({ level: 2, class: 'summary-title' }, 'Retrait au comptoir'),
            p({ class: 'muted' }, 'atelier. · 12 rue des Lilas · ouvert de 7 h à 19 h. Votre commande est prête en 15 minutes.'),
            ul({ class: 'checkout-lines' }, forNode(checkout.checkoutLines, { track: (line) => lineKey(line.line), empty: () => li({ class: 'muted' }, 'Votre panier est vide.') }, (line) => li([
              span(function* () { return (yield* line()).nameLabel; }),
              span({ class: 'price' }, function* () { return (yield* line()).totalLabel; }),
            ]))),
          ]),
          aside({ class: 'summary' }, [
            div({ class: 'summary-total' }, [span('À régler au comptoir'), strong(checkout.totalLabel)]),
            button('confirm-order', { type: 'button', class: 'button button-block', disabled: checkout.confirmDisabled, *click() {
              const lines = yield* cart.cartLines();
              if (lines.length) yield* placeOrderProcess.call(lines);
            } }, checkout.confirmLabel),
            ifNode(placeOrderProcess.hasException, () => p({ class: 'notice error' }, checkout.failureLabel)),
            a('cancel-checkout', { class: 'text-link center' }, '← Retour au panier').pipe(CraftRouterLink({ to: 'panier' })),
          ]),
        ]),
      ])),
  ]);
});

export { HomePage, CataloguePage, ProductPage, FormulaPage, CartPage, CheckoutPage };
