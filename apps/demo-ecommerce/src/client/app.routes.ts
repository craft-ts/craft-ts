import { loadCraftComponent } from '@craft-ts/component';
import { assertExhaustiveRouteExceptions, craftRoute, craftRoutes } from '@craft-ts/core';

export const { ecommerceRoutes: appRoutes } = craftRoutes('ecommerce', [
  craftRoute('', { ...loadCraftComponent(({ withRetry }) => withRetry(import('./store-pages')).then((module) => module.HomePage)) }),
  craftRoute('catalogue', { ...loadCraftComponent(({ withRetry }) => withRetry(import('./store-pages')).then((module) => module.CataloguePage)) }),
  craftRoute('produit/:id', { ...loadCraftComponent(({ withRetry }) => withRetry(import('./store-pages')).then((module) => module.ProductPage)) }),
  craftRoute('formule/:id', { ...loadCraftComponent(({ withRetry }) => withRetry(import('./store-pages')).then((module) => module.FormulaPage)) }),
  craftRoute('panier', { ...loadCraftComponent(({ withRetry }) => withRetry(import('./store-pages')).then((module) => module.CartPage)) }),
  craftRoute('paiement', { ...loadCraftComponent(({ withRetry }) => withRetry(import('./store-pages')).then((module) => module.CheckoutPage)) }),
  craftRoute('confirmation', { ...loadCraftComponent(({ withRetry }) => withRetry(import('./store-pages')).then((module) => module.ConfirmationPage)) }),
  craftRoute('admin', { ...loadCraftComponent(({ withRetry }) => withRetry(import('./admin-page')).then((module) => module.AdminPage)) }),
]);

assertExhaustiveRouteExceptions(appRoutes);
