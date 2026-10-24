import { serverFunction } from '@craft-ts/core';
import { Effect, Schema } from 'effect';
import { requireAdmin, requireStaff, signIn, signOut } from './auth';
import { StoreRepository } from './database';

const category = Schema.Struct({ id: Schema.String, name: Schema.String, description: Schema.String });
const choiceGroup = Schema.Struct({ id: Schema.String, categoryId: Schema.String, min: Schema.Number, max: Schema.Number });
const simpleProduct = Schema.Struct({ kind: Schema.Literal('simple'), id: Schema.String, name: Schema.String, description: Schema.String, categoryId: Schema.String, price: Schema.Number, stock: Schema.Number, emoji: Schema.optional(Schema.String) });
const formulaProduct = Schema.Struct({ kind: Schema.Literal('formule'), id: Schema.String, name: Schema.String, description: Schema.String, categoryId: Schema.String, price: Schema.Number, groups: Schema.Array(choiceGroup), emoji: Schema.optional(Schema.String) });
const product = Schema.Union([simpleProduct, formulaProduct]);
const cartLine = Schema.Struct({ productId: Schema.String, quantity: Schema.Number, selections: Schema.optional(Schema.Array(Schema.Struct({ groupId: Schema.String, productIds: Schema.Array(Schema.String) }))) });
const output = Schema.toStandardSchemaV1(Schema.String);
const storeErrors = { StoreError: (error: { readonly message: string }) => ({ code: 'STORE_ERROR', status: 400, message: error.message }) };
const authErrors = { AuthError: (error: { readonly message: string; readonly status: 401 | 403 }) => ({ code: error.status === 401 ? 'AUTH_REQUIRED' : 'FORBIDDEN', status: error.status, message: error.message }) };
const adminErrors = { ...storeErrors, ...authErrors };

export const getCatalog = serverFunction('ecommerce.catalog', Schema.toStandardSchemaV1(Schema.Struct({})), { exposure: 'client', output }).handler(() => Effect.gen(function* () {
  const repository = yield* StoreRepository;
  const { categories, products } = yield* repository.read();
  return JSON.stringify({ categories, products });
})).exposeErrors(storeErrors);

export const login = serverFunction('ecommerce.auth.login', Schema.toStandardSchemaV1(Schema.Struct({ email: Schema.String, password: Schema.String })), { exposure: 'client', output }).handler(({ input }) => Effect.gen(function* () {
  return JSON.stringify(yield* signIn(input.email, input.password));
})).exposeErrors(authErrors);

export const logout = serverFunction('ecommerce.auth.logout', Schema.toStandardSchemaV1(Schema.Struct({ token: Schema.String })), { exposure: 'client', output }).handler(({ input }) => Effect.gen(function* () {
  yield* signOut(input.token);
  return JSON.stringify({ ok: true });
})).exposeErrors({});

// Toutes les fonctions d'administration commencent par vérifier la session :
// le rôle affiché dans le navigateur n'est qu'un confort d'interface.
export const getAdminOverview = serverFunction('ecommerce.admin.overview', Schema.toStandardSchemaV1(Schema.Struct({ token: Schema.String })), { exposure: 'client', output }).handler(({ input }) => Effect.gen(function* () {
  yield* requireStaff(input.token);
  const repository = yield* StoreRepository;
  return JSON.stringify(yield* repository.read());
})).exposeErrors(adminErrors);

// Seuls les admins ont le droit de modifier un produit : les product managers
// voient le catalogue dans l'administration, mais l'enregistrement leur est refusé.
export const saveProduct = serverFunction('ecommerce.product.save', Schema.toStandardSchemaV1(Schema.Struct({ token: Schema.String, product })), { exposure: 'client', output }).handler(({ input }) => Effect.gen(function* () {
  yield* requireAdmin(input.token);
  const repository = yield* StoreRepository;
  return JSON.stringify(yield* repository.saveProduct(input.product));
})).exposeErrors(adminErrors);

// Même règle pour la suppression : réservée aux admins.
export const deleteProduct = serverFunction('ecommerce.product.delete', Schema.toStandardSchemaV1(Schema.Struct({ token: Schema.String, id: Schema.String })), { exposure: 'client', output }).handler(({ input }) => Effect.gen(function* () {
  yield* requireAdmin(input.token);
  const repository = yield* StoreRepository;
  return JSON.stringify(yield* repository.deleteProduct(input.id));
})).exposeErrors(adminErrors);

export const saveCategory = serverFunction('ecommerce.category.save', Schema.toStandardSchemaV1(Schema.Struct({ token: Schema.String, category })), { exposure: 'client', output }).handler(({ input }) => Effect.gen(function* () {
  yield* requireAdmin(input.token);
  const repository = yield* StoreRepository;
  return JSON.stringify(yield* repository.saveCategory(input.category));
})).exposeErrors(adminErrors);

export const deleteCategory = serverFunction('ecommerce.category.delete', Schema.toStandardSchemaV1(Schema.Struct({ token: Schema.String, id: Schema.String })), { exposure: 'client', output }).handler(({ input }) => Effect.gen(function* () {
  yield* requireAdmin(input.token);
  const repository = yield* StoreRepository;
  return JSON.stringify(yield* repository.deleteCategory(input.id));
})).exposeErrors(adminErrors);

export const checkout = serverFunction('ecommerce.checkout', Schema.toStandardSchemaV1(Schema.Struct({ lines: Schema.Array(cartLine) })), { exposure: 'client', output }).handler(({ input }) => Effect.gen(function* () {
  const repository = yield* StoreRepository;
  return JSON.stringify(yield* repository.checkout(input.lines));
})).exposeErrors(storeErrors);

export const resetStore = serverFunction('ecommerce.reset', Schema.toStandardSchemaV1(Schema.Struct({ token: Schema.String })), { exposure: 'client', output }).handler(({ input }) => Effect.gen(function* () {
  yield* requireAdmin(input.token);
  const repository = yield* StoreRepository;
  return JSON.stringify(yield* repository.reset());
})).exposeErrors(adminErrors);
