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
      'items',
      [],
      insertStoragePersister(craftUnique({ storeName: 'shop', key: 'cart' })),
    );
  },
);
