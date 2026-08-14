import {
  craftService,
  craftUnique,
  insertStoragePersister,
  state,
} from '../craft-runtime';

export const { Cart, provideCart } = craftService(
  { name: 'Cart', scope: 'toProvide' },
  function* () {
    const items = yield* state(
      'cartItems',
      [],
      insertStoragePersister(craftUnique({ storeName: 'shop', key: 'cart' })),
    );
    return { items };
  },
);
