import {
  craftService,
  craftUnique,
  insertStoragePersister,
  state,
} from '../craft-runtime';

export const { Cart, provideCart } = craftService(
  { name: 'Cart', providedIn: 'toProvide' },
  function* () {
    const items = yield* state(
      'cartItems',
      [],
      insertStoragePersister(craftUnique({ storeName: 'shop', key: 'cart' })),
    );
    return { items };
  },
);
