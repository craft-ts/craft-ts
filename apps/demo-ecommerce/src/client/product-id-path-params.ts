import { abstract, craftService, pathParams, type PathParamsRefOf } from '@craft-ts/core';

/** Identifiant du produit lu dans l'URL (`produit/:productId`, `formule/:productId`), réactif d'une fiche à l'autre. */
export const productIdPathParam = pathParams('productId', {}, () => ({}));

type ProductIdPathParamsRef = PathParamsRefOf<typeof productIdPathParam>;

export const { ProductIdPathParams, provideProductIdPathParams } = craftService(
  { name: 'ProductIdPathParams', providedIn: 'abstract' },
  abstract<ProductIdPathParamsRef>(),
);
