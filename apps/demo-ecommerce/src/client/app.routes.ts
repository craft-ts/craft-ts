import { loadCraftComponent } from '@craft-ts/component';
import { assertExhaustiveRouteExceptions, craftRoute, craftRoutes } from '@craft-ts/core';
import { productIdPathParam, provideProductIdPathParams } from './product-id-path-params';

export const { ecommerceRoutes: appRoutes } = craftRoutes('ecommerce', [
  craftRoute('', { ...loadCraftComponent(({ withRetry }) => withRetry(import('./store-pages')).then((module) => module.HomePage)) }),
  craftRoute('catalogue', { ...loadCraftComponent(({ withRetry }) => withRetry(import('./store-pages')).then((module) => module.CataloguePage)) }),
  {
    path: 'produit/:productId',
    ...loadCraftComponent(({ withRetry }) => withRetry(import('./store-pages')).then((module) => module.ProductPage)),
    pathParams: { productId: productIdPathParam },
    providersFn: ({ ProductIdPathParams }) => [provideProductIdPathParams(function* () { return yield* ProductIdPathParams(); })],
  },
  {
    path: 'formule/:productId',
    ...loadCraftComponent(({ withRetry }) => withRetry(import('./store-pages')).then((module) => module.FormulaPage)),
    pathParams: { productId: productIdPathParam },
    providersFn: ({ ProductIdPathParams }) => [provideProductIdPathParams(function* () { return yield* ProductIdPathParams(); })],
  },
  craftRoute('panier', { ...loadCraftComponent(({ withRetry }) => withRetry(import('./store-pages')).then((module) => module.CartPage)) }),
  craftRoute('paiement', { ...loadCraftComponent(({ withRetry }) => withRetry(import('./store-pages')).then((module) => module.CheckoutPage)) }),
  craftRoute('connexion', { ...loadCraftComponent(({ withRetry }) => withRetry(import('./account-pages')).then((module) => module.LoginPage)) }),
  craftRoute('admin', { ...loadCraftComponent(({ withRetry }) => withRetry(import('./admin-page')).then((module) => module.AdminPage)) }),
]);

assertExhaustiveRouteExceptions(appRoutes);

// Chemins écrits à la main : les dériver de `appRoutes` ferait boucler le typage,
// car les pages chargées ici appellent elles-mêmes `CraftRouter.navigate`.
type EcommerceRoutePath = '' | 'catalogue' | 'produit/:productId' | 'formule/:productId' | 'panier' | 'paiement' | 'connexion' | 'admin';

declare module '@craft-ts/core' {
  interface CraftRouterRoutesRegistry {
    Ecommerce: readonly { [Path in EcommerceRoutePath]: { path: Path } }[EcommerceRoutePath][];
  }
}
