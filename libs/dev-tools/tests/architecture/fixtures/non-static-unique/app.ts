import {
  craftService,
  craftUnique,
  insertStoragePersister,
  query,
} from '../craft-runtime';

const identity = { key: 'user', storeName: 'shop' };

export const { Users } = craftService(
  { name: 'Users', providedIn: 'global' },
  function* () {
    const cached = yield* query(
      'cached',
      {},
      insertStoragePersister(craftUnique(identity)),
    );
    return { cached };
  },
);
