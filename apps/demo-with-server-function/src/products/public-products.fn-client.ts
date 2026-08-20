import { craftUnique, createServerFunctionClient } from '@craft-ts/core';
import type { listPublicProducts as ServerListPublicProducts } from './public-products.fn-serveur';

/** The public facade needs no client middleware or context attachment. */
export const getPublicProducts = createServerFunctionClient<
  typeof ServerListPublicProducts
>(craftUnique('demo.products.list'));
