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
      'list',
      {},
      insertStoragePersister(
        craftUnique({ key: 'user', storeName: 'shop' }),
      ),
    );
  },
);

export const { AdminUsers } = craftService(
  { name: 'AdminUsers', providedIn: 'global' },
  function* () {
    const list = yield* state(
      'list',
      [],
      insertStoragePersister(
        craftUnique({ key: 'user', storeName: 'admin' }),
      ),
    );
  },
);
