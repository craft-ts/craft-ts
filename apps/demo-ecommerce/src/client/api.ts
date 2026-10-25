import { craftUnique, createServerFunctionClient, isCraftException } from '@craft-ts/core';
import type { getCatalog, searchCatalog as searchCatalogFunction, createCart as createCartFunction, addCartLine as addCartLineFunction, getCart as getCartFunction, deleteCart as deleteCartFunction, login, getCurrentUser, logout, getAdminOverview, saveProduct, deleteProduct, saveCategory, deleteCategory, checkout, resetStore } from '../server/functions';
import type { AccountSession } from '../shared/accounts';
import type { Catalog, CartLine, Category, Order, Product, ServerCart, StoreData } from '../shared/model';

const rawCatalog = createServerFunctionClient<typeof getCatalog>(craftUnique('ecommerce.catalog'));
const rawSearchCatalog = createServerFunctionClient<typeof searchCatalogFunction>(craftUnique('ecommerce.catalog.search'));
const rawCreateCart = createServerFunctionClient<typeof createCartFunction>(craftUnique('ecommerce.cart.create'));
const rawAddCartLine = createServerFunctionClient<typeof addCartLineFunction>(craftUnique('ecommerce.cart.addLine'));
const rawGetCart = createServerFunctionClient<typeof getCartFunction>(craftUnique('ecommerce.cart.get'));
const rawDeleteCart = createServerFunctionClient<typeof deleteCartFunction>(craftUnique('ecommerce.cart.delete'));
const rawLogin = createServerFunctionClient<typeof login>(craftUnique('ecommerce.auth.login'));
const rawCurrentUser = createServerFunctionClient<typeof getCurrentUser>(craftUnique('ecommerce.auth.me'));
const rawLogout = createServerFunctionClient<typeof logout>(craftUnique('ecommerce.auth.logout'));
const rawAdminOverview = createServerFunctionClient<typeof getAdminOverview>(craftUnique('ecommerce.admin.overview'));
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
type Authenticated<Input> = Input & { readonly token: string };

export function* catalog(input: Record<string, never>): Generator<unknown, Catalog, unknown> { return decode<Catalog>(yield* rawCatalog(input)); }
export function* searchCatalog(input: { readonly query: string }): Generator<unknown, Product[], unknown> { return decode<Product[]>(yield* rawSearchCatalog(input)); }
export function* createCart(input: Record<string, never>): Generator<unknown, ServerCart, unknown> { return decode<ServerCart>(yield* rawCreateCart(input)); }
export function* addCartLine(input: { readonly cartId: string; readonly line: CartLine }): Generator<unknown, ServerCart, unknown> { return decode<ServerCart>(yield* rawAddCartLine(input)); }
export function* getCart(input: { readonly cartId: string }): Generator<unknown, ServerCart, unknown> { return decode<ServerCart>(yield* rawGetCart(input)); }
export function* deleteCart(input: { readonly cartId: string }): Generator<unknown, unknown, unknown> { return yield* rawDeleteCart(input); }
export function* signIn(input: { readonly email: string; readonly password: string }): Generator<unknown, AccountSession, unknown> { return decode<AccountSession>(yield* rawLogin(input)); }
export function* currentUser(input: { readonly token: string }): Generator<unknown, AccountSession, unknown> { return decode<AccountSession>(yield* rawCurrentUser(input)); }
export function* signOut(input: { readonly token: string }): Generator<unknown, unknown, unknown> { return yield* rawLogout(input); }
export function* adminOverview(input: Authenticated<Record<never, never>>): Generator<unknown, StoreData, unknown> { return decode<StoreData>(yield* rawAdminOverview(input)); }
export function* productSave(input: Authenticated<{ readonly product: Product }>): Generator<unknown, StoreData, unknown> { return decode<StoreData>(yield* rawProductSave(input)); }
export function* productDelete(input: Authenticated<{ readonly id: string }>): Generator<unknown, StoreData, unknown> { return decode<StoreData>(yield* rawProductDelete(input)); }
export function* categorySave(input: Authenticated<{ readonly category: Category }>): Generator<unknown, StoreData, unknown> { return decode<StoreData>(yield* rawCategorySave(input)); }
export function* categoryDelete(input: Authenticated<{ readonly id: string }>): Generator<unknown, StoreData, unknown> { return decode<StoreData>(yield* rawCategoryDelete(input)); }
export function* placeOrder(input: { readonly lines: readonly CartLine[] }): Generator<unknown, Order, unknown> { return decode<Order>(yield* rawOrder(input)); }
export function* reset(input: Authenticated<Record<never, never>>): Generator<unknown, StoreData, unknown> { return decode<StoreData>(yield* rawReset(input)); }
