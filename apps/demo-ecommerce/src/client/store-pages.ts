import { a, button, craftComponent, div, forNode, heading, ifNode, input, label, main, p, section, span, strong } from '@craft-ts/component';
import { CraftRouter, CraftRouterLink, craftComputed, craftService, craftUse, isCraftException, query } from '@craft-ts/core';
import { catalog, placeOrder } from './api';
import type { CartLine, FormulaSelection, StoreData } from '../shared/model';
import { initialStore } from '../shared/model';

const cartKey = 'atelier.cart.v1';
function readCart(): CartLine[] { try { return JSON.parse(localStorage.getItem(cartKey) ?? '[]') as CartLine[]; } catch { return []; } }
function writeCart(lines: readonly CartLine[]) { localStorage.setItem(cartKey, JSON.stringify(lines)); }
function addToCart(line: CartLine) {
  const lines = readCart();
  const match = lines.find((item) => item.productId === line.productId && JSON.stringify(item.selections ?? []) === JSON.stringify(line.selections ?? []));
  if (match) writeCart(lines.map((item) => item === match ? { ...item, quantity: item.quantity + line.quantity } : item));
  else writeCart([...lines, line]);
}
const loadStore = function* (): Generator<unknown, StoreData, unknown> {
  try { return yield* catalog({}); }
  catch { return structuredClone(initialStore); }
};

export const { StorefrontView, provideStorefrontView } = craftService({ name: 'storefrontView', providedIn: 'toProvide' }, function* () {
  yield* query('storeQuery', { params: () => true, loader: loadStore }, ({ resource }) => ({
    products: craftUse(craftComputed('storeProducts', function* () { return (yield* resource.value())?.products ?? []; })),
    catalogProducts: craftUse(craftComputed('catalogProducts', function* () {
      return ((yield* resource.value())?.products ?? []).filter((product) => product.kind === 'formule' || product.stock > 0);
    })),
    categories: craftUse(craftComputed('storeCategories', function* () { return (yield* resource.value())?.categories ?? []; })),
    currentProduct: craftUse(craftComputed('currentProduct', function* () {
      const id = decodeURIComponent(window.location.pathname.split('/').pop() ?? '');
      return (yield* resource.value())?.products.find((product) => product.id === id);
    })),
  }));
  yield* query('placeOrderProcess', {
    method: (lines: readonly CartLine[]) => lines,
    loader: function* ({ params: lines }) { return yield* placeOrder({ lines }); },
  });
});

const HomePage = craftComponent('EcommerceHomePage', { providers: [provideStorefrontView()] }, function* () {
  yield* StorefrontView();
  return main([
    section({ class: 'hero' }, [span({ class: 'eyebrow' }, 'Une pause qui fait du bien'), heading('Du bon, tout simplement.'), p('Un café de quartier, des pâtisseries du matin et des formules à composer selon vos envies.'), a('hero-shop', { class: 'button' }, 'Découvrir la boutique →').pipe(CraftRouterLink({ to: 'catalogue' }))]),
    div({ class: 'section-head' }, [div([span({ class: 'eyebrow' }, 'À la carte'), heading({ class: 'page-title' }, 'Les petites attentions')]), span({ class: 'pill' }, 'Fait maison chaque jour')]),
    p({ class: 'subtitle' }, 'Explorez nos cafés, nos douceurs et nos formules personnalisables.'),
  ]);
});

const CataloguePage = craftComponent('EcommerceCataloguePage', { providers: [provideStorefrontView()] }, function* () {
  const { storeQuery } = yield* StorefrontView();
  return main([
    span({ class: 'eyebrow' }, 'Le comptoir'), heading({ class: 'page-title' }, 'La boutique'), p({ class: 'subtitle' }, 'Tout est préparé avec soin. Les produits épuisés disparaissent du catalogue.'),
    div({ class: 'grid' }, forNode(storeQuery.catalogProducts, { track: (product) => product.id }, (product) =>
      div({ class: 'card' }, [
        span({ class: 'badge' }, function* () { const value = yield* product(); const categories = yield* storeQuery.categories(); return categories.find((category) => category.id === value.categoryId)?.name ?? 'Catégorie'; }),
        heading({ level: 3 }, function* () { return (yield* product()).name; }),
        button('view-product', { type: 'button', class: 'button-secondary', *click() { const value = yield* product(); yield* CraftRouter.navigate({ to: 'produit/:id', params: { id: value.id } }); } }, 'Voir le détail →'),
        p(function* () { return (yield* product()).description; }),
        div({ class: 'row' }, [span({ class: 'price' }, function* () { return `€${(yield* product()).price.toFixed(2)}`; }),
          button('add-product', { type: 'button', class: 'button', *click() { const value = yield* product(); if (value.kind === 'formule') yield* CraftRouter.navigate({ to: 'formule/:id', params: { id: value.id } }); else { addToCart({ productId: value.id, quantity: 1 }); window.alert(`${value.name} ajouté au panier.`); } } }, function* () { return (yield* product()).kind === 'formule' ? 'Composer' : 'Ajouter'; }),
        ]),
      ]),
    )),
  ]);
});

const ProductPage = craftComponent('EcommerceProductPage', { providers: [provideStorefrontView()] }, function* () {
  const { storeQuery } = yield* StorefrontView();
  return main([span({ class: 'eyebrow' }, 'La pièce du jour'), heading({ class: 'page-title' }, function* () { return (yield* storeQuery.currentProduct())?.name ?? 'Produit introuvable'; }),
    p({ class: 'subtitle' }, function* () { return (yield* storeQuery.currentProduct())?.description ?? 'Ce produit ne figure plus dans notre catalogue.'; }),
    div({ class: 'panel' }, [span({ class: 'price' }, function* () { const product = yield* storeQuery.currentProduct(); return product ? `€${product.price.toFixed(2)}` : ''; }),
      button('detail-add', { type: 'button', class: 'button', *click() { const product = yield* storeQuery.currentProduct(); if (product?.kind === 'simple' && product.stock > 0) { addToCart({ productId: product.id, quantity: 1 }); yield* CraftRouter.navigate({ to: 'panier' }); } else if (product?.kind === 'formule') yield* CraftRouter.navigate({ to: 'formule/:id', params: { id: product.id } }); } }, 'Ajouter au panier / composer'),
    ]), a('back-catalog', { class: 'button-secondary' }, '← Retour au catalogue').pipe(CraftRouterLink({ to: 'catalogue' })),
  ]);
});

const FormulaComposer = craftComponent('EcommerceFormulaComposer', { providers: [provideStorefrontView()] }, function* () {
  const { storeQuery } = yield* StorefrontView();
  const formulaId = decodeURIComponent(window.location.pathname.split('/').pop() ?? '');
  const formula = yield* storeQuery.currentProduct();
  if (!formula || formula.kind !== 'formule' || formula.id !== formulaId) return p('Cette formule est introuvable.');
  const allProducts = yield* storeQuery.products();
  const categories = yield* storeQuery.categories();
  const selections = new Map<string, Set<string>>();
  for (const group of formula.groups) selections.set(group.id, new Set());
  return section([strong(formula.name), p({ class: 'subtitle' }, `${formula.description} · €${formula.price.toFixed(2)}`),
    ...formula.groups.map((group) => {
      const options = allProducts.filter((product) => product.kind === 'simple' && product.categoryId === group.categoryId && product.stock > 0);
      const groupCategoryName = categories.find((category) => category.id === group.categoryId)?.name ?? 'Choix';
      return section({ class: 'panel' }, [strong(`${groupCategoryName} · ${group.min} à ${group.max} choix`),
          ...options.map((product) => label({ class: 'choice' }, [input(`choice-${group.id}-${product.id}`, { type: 'checkbox', *change(event) { const selected = selections.get(group.id); if (!selected) return; if (event.target.checked) selected.add(product.id); else selected.delete(product.id); } }), `${product.name} · €${product.price.toFixed(2)} · ${product.kind === 'simple' ? product.stock : 0} disponibles`])),
        ...(options.length ? [] : [p('Aucun produit disponible dans cette catégorie.')])]);
    }),
    button('add-formula', { type: 'button', class: 'button', *click() {
          for (const group of formula.groups) { const count = selections.get(group.id)?.size ?? 0; if (count < group.min || count > group.max) { window.alert(`Choisissez entre ${group.min} et ${group.max} produits dans chaque groupe.`); return; } }
          const picked: FormulaSelection[] = formula.groups.map((group) => ({ groupId: group.id, productIds: [...(selections.get(group.id) ?? [])] }));
      addToCart({ productId: formula.id, quantity: 1, selections: picked }); yield* CraftRouter.navigate({ to: 'panier' });
    } }, 'Ajouter la formule au panier'),
  ]);
});

const FormulaPage = craftComponent('EcommerceFormulaPage', { providers: [provideStorefrontView()] }, function* () {
  const { storeQuery } = yield* StorefrontView();
  return main([span({ class: 'eyebrow' }, 'À composer'), heading({ class: 'page-title' }, 'Personnalisez votre formule'),
    ifNode('formula-detail', storeQuery.currentProduct, () => FormulaComposer()),
  ]);
});

const CartPage = craftComponent('EcommerceCartPage', { providers: [provideStorefrontView()] }, function* () {
  const { storeQuery } = yield* StorefrontView();
  const lines = readCart();
  if (!lines.length) return main([span({ class: 'eyebrow' }, 'Avant de se régaler'), heading({ class: 'page-title' }, 'Votre panier'), div({ class: 'panel' }, [p('Votre panier est encore vide.'), a('empty-shop', { class: 'button' }, 'Voir la boutique').pipe(CraftRouterLink({ to: 'catalogue' }))])]);
  return main([span({ class: 'eyebrow' }, 'Avant de se régaler'), heading({ class: 'page-title' }, 'Votre panier'),
    div('cart-panel', { class: 'panel' }, [
      forNode(lines, { track: (line) => `${line.productId}-${JSON.stringify(line.selections ?? [])}` }, (line) => div({ class: 'row' }, [
        div([strong(function* () { const item = yield* line(); const products = yield* storeQuery.products(); const value = products.find((row) => row.id === item.productId); return value?.name ?? 'Produit retiré'; }), p({ class: 'muted' }, function* () { const value = yield* line(); return `Quantité : ${value.quantity}${value.selections ? ' · Formule composée' : ''}`; })]),
        span({ class: 'price' }, function* () { const value = yield* line(); const products = yield* storeQuery.products(); const product = products.find((row) => row.id === value.productId); return `€${((product?.price ?? 0) * value.quantity).toFixed(2)}`; }),
        button('remove-line', { type: 'button', class: 'button-secondary', *click() { const lineValue = yield* line(); const next = readCart().filter((item) => item !== lineValue); writeCart(next); window.location.reload(); } }, 'Retirer'),
      ])),
      div({ class: 'section-head' }, [strong('Total'), span({ class: 'price' }, function* () { const products = yield* storeQuery.products(); const current = readCart(); return `€${current.reduce((sum, line) => sum + (products.find((product) => product.id === line.productId)?.price ?? 0) * line.quantity, 0).toFixed(2)}`; })]), a('to-checkout', { class: 'button' }, 'Continuer vers le paiement →').pipe(CraftRouterLink({ to: 'paiement' })),
    ]),
  ]);
});

const CheckoutPage = craftComponent('EcommerceCheckoutPage', { providers: [provideStorefrontView()] }, function* () {
  const { placeOrderProcess } = yield* StorefrontView();
  const hasOrderResult = craftUse(craftComputed('hasOrderResult', () => placeOrderProcess.hasValue()));
  return main([span({ class: 'eyebrow' }, 'Paiement fictif'), heading({ class: 'page-title' }, 'On y est presque'), p({ class: 'subtitle' }, 'Aucune donnée bancaire n’est demandée. Le stock est revérifié au moment de confirmer.'),
    div({ class: 'panel' }, [p('Votre commande sera enregistrée dans la boutique de démonstration.'), button('confirm-order', { type: 'button', class: 'button', disabled: placeOrderProcess.isLoading, *click() {
      const cart = readCart();
      if (!cart.length) { window.alert('Votre panier est vide.'); return; }
      yield* placeOrderProcess.call(cart);
    } }, 'Confirmer la commande'),
      ifNode(placeOrderProcess.isLoading, () => p({ class: 'muted' }, 'Validation de la commande…')),
      ifNode(placeOrderProcess.hasException, () => p({ class: 'notice' }, 'La commande n’a pas pu être validée. Vérifiez le stock et réessayez.')),
      ifNode(hasOrderResult, () => div({ class: 'notice' }, [p(function* () { const result = yield* placeOrderProcess.value(); return !result || isCraftException(result) ? 'La commande n’a pas pu être validée. Vérifiez le stock et réessayez.' : `Commande ${result.id} enregistrée.`; }), button('view-confirmation', { type: 'button', class: 'button', *click() { const order = yield* placeOrderProcess.value(); if (!order || isCraftException(order)) return; writeCart([]); localStorage.setItem('atelier.last-order', JSON.stringify(order)); yield* CraftRouter.navigate({ to: 'confirmation' }); } }, 'Voir la confirmation') ])),
      a('cancel-checkout', { class: 'button-secondary' }, 'Retour au panier').pipe(CraftRouterLink({ to: 'panier' }))]),
  ]);
});

const ConfirmationPage = craftComponent('EcommerceConfirmationPage', {}, () => {
  let orderId = 'Commande confirmée';
  try { orderId = JSON.parse(localStorage.getItem('atelier.last-order') ?? '{}').id ?? orderId; } catch { /* panier vidé ou stockage absent */ }
  return main([span({ class: 'eyebrow' }, 'Merci pour votre commande'), heading({ class: 'page-title' }, 'C’est tout bon !'), p({ class: 'subtitle' }, `Votre commande ${orderId} est enregistrée. Le stock des composants a été mis à jour.`), a('confirmation-shop', { class: 'button' }, 'Revenir à la boutique').pipe(CraftRouterLink({ to: 'catalogue' }))]);
});

export { HomePage, CataloguePage, ProductPage, FormulaPage, CartPage, CheckoutPage, ConfirmationPage };
