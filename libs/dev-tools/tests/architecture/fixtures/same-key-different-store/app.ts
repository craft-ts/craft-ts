import {
  craftService,
  craftUnique,
  insertStoragePersister,
  query,
  state,
} from '../craft-runtime';

export const { ShopUsers } = craftService(
  { name: 'ShopUsers', providedIn: 'global' },
  function* () {
    const list = yield* query(
      'shopUsers',
      {},
      insertStoragePersister(
        craftUnique({ key: 'user', storeName: 'shop' }),
      ),
    );
    return { list };
  },
);

export const { AdminUsers } = craftService(
  { name: 'AdminUsers', providedIn: 'global' },
  function* () {
    const list = yield* state(
      'adminUsers',
      [],
      insertStoragePersister(
        craftUnique({ key: 'user', storeName: 'admin' }),
      ),
    );
    return { list };
  },
);
