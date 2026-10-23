import { serverFunction } from '@craft-ts/core';
import { Effect, Schema } from 'effect';
import { StoreRepository } from './database';

const category = Schema.Struct({ id: Schema.String, name: Schema.String, description: Schema.String });
const choiceGroup = Schema.Struct({ id: Schema.String, categoryId: Schema.String, min: Schema.Number, max: Schema.Number });
const simpleProduct = Schema.Struct({ kind: Schema.Literal('simple'), id: Schema.String, name: Schema.String, description: Schema.String, categoryId: Schema.String, price: Schema.Number, stock: Schema.Number });
const formulaProduct = Schema.Struct({ kind: Schema.Literal('formule'), id: Schema.String, name: Schema.String, description: Schema.String, categoryId: Schema.String, price: Schema.Number, groups: Schema.Array(choiceGroup) });
const product = Schema.Union([simpleProduct, formulaProduct]);
const cartLine = Schema.Struct({ productId: Schema.String, quantity: Schema.Number, selections: Schema.optional(Schema.Array(Schema.Struct({ groupId: Schema.String, productIds: Schema.Array(Schema.String) }))) });
const output = Schema.toStandardSchemaV1(Schema.String);
const storeErrors = { StoreError: (error: { readonly message: string }) => ({ code: 'STORE_ERROR', status: 400, message: error.message }) };

export const getCatalog = serverFunction('ecommerce.catalog', Schema.toStandardSchemaV1(Schema.Struct({})), { exposure: 'client', output }).handler(() => Effect.gen(function* () {
  const repository = yield* StoreRepository;
  return JSON.stringify(yield* repository.read());
})).exposeErrors(storeErrors);

export const saveProduct = serverFunction('ecommerce.product.save', Schema.toStandardSchemaV1(Schema.Struct({ product })), { exposure: 'client', output }).handler(({ input }) => Effect.gen(function* () {
  const repository = yield* StoreRepository;
  return JSON.stringify(yield* repository.saveProduct(input.product));
})).exposeErrors(storeErrors);

export const deleteProduct = serverFunction('ecommerce.product.delete', Schema.toStandardSchemaV1(Schema.Struct({ id: Schema.String })), { exposure: 'client', output }).handler(({ input }) => Effect.gen(function* () {
  const repository = yield* StoreRepository;
  return JSON.stringify(yield* repository.deleteProduct(input.id));
})).exposeErrors(storeErrors);

export const saveCategory = serverFunction('ecommerce.category.save', Schema.toStandardSchemaV1(Schema.Struct({ category })), { exposure: 'client', output }).handler(({ input }) => Effect.gen(function* () {
  const repository = yield* StoreRepository;
  return JSON.stringify(yield* repository.saveCategory(input.category));
})).exposeErrors(storeErrors);

export const deleteCategory = serverFunction('ecommerce.category.delete', Schema.toStandardSchemaV1(Schema.Struct({ id: Schema.String })), { exposure: 'client', output }).handler(({ input }) => Effect.gen(function* () {
  const repository = yield* StoreRepository;
  return JSON.stringify(yield* repository.deleteCategory(input.id));
})).exposeErrors(storeErrors);

export const checkout = serverFunction('ecommerce.checkout', Schema.toStandardSchemaV1(Schema.Struct({ lines: Schema.Array(cartLine) })), { exposure: 'client', output }).handler(({ input }) => Effect.gen(function* () {
  const repository = yield* StoreRepository;
  return JSON.stringify(yield* repository.checkout(input.lines));
})).exposeErrors(storeErrors);

export const resetStore = serverFunction('ecommerce.reset', Schema.toStandardSchemaV1(Schema.Struct({})), { exposure: 'client', output }).handler(() => Effect.gen(function* () {
  const repository = yield* StoreRepository;
  return JSON.stringify(yield* repository.reset());
})).exposeErrors(storeErrors);
