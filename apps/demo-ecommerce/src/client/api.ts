import { craftUnique, createServerFunctionClient, isCraftException } from '@craft-ts/core';
import type { getCatalog, saveProduct, deleteProduct, saveCategory, deleteCategory, checkout, resetStore } from '../server/functions';
import type { CartLine, Category, Order, Product, StoreData } from '../shared/model';

const rawCatalog = createServerFunctionClient<typeof getCatalog>(craftUnique('ecommerce.catalog'));
const rawProductSave = createServerFunctionClient<typeof saveProduct>(craftUnique('ecommerce.product.save'));
const rawProductDelete = createServerFunctionClient<typeof deleteProduct>(craftUnique('ecommerce.product.delete'));
const rawCategorySave = createServerFunctionClient<typeof saveCategory>(craftUnique('ecommerce.category.save'));
const rawCategoryDelete = createServerFunctionClient<typeof deleteCategory>(craftUnique('ecommerce.category.delete'));
const rawOrder = createServerFunctionClient<typeof checkout>(craftUnique('ecommerce.checkout'));
const rawReset = createServerFunctionClient<typeof resetStore>(craftUnique('ecommerce.reset'));

function decode<A>(value: string): A {
  // Server-function failures travel as Craft exception values. Preserve them
  // for query/resource handling instead of trying to parse them as JSON text.
  return isCraftException(value) ? value as A : JSON.parse(value) as A;
}
export function* catalog(input: Record<string, never>): Generator<unknown, StoreData, unknown> { return decode<StoreData>(yield* rawCatalog(input)); }
export function* productSave(input: { readonly product: Product }): Generator<unknown, StoreData, unknown> { return decode<StoreData>(yield* rawProductSave(input)); }
export function* productDelete(input: { readonly id: string }): Generator<unknown, StoreData, unknown> { return decode<StoreData>(yield* rawProductDelete(input)); }
export function* categorySave(input: { readonly category: Category }): Generator<unknown, StoreData, unknown> { return decode<StoreData>(yield* rawCategorySave(input)); }
export function* categoryDelete(input: { readonly id: string }): Generator<unknown, StoreData, unknown> { return decode<StoreData>(yield* rawCategoryDelete(input)); }
export function* placeOrder(input: { readonly lines: readonly CartLine[] }): Generator<unknown, Order, unknown> { return decode<Order>(yield* rawOrder(input)); }
export function* reset(input: Record<string, never>): Generator<unknown, StoreData, unknown> { return decode<StoreData>(yield* rawReset(input)); }
