import { craftService, insertStoragePersister, query } from '../craft-runtime';

export const { Users } = craftService(
  { name: 'Users', providedIn: 'global' },
  function* () {
    yield* query(
      'leaked',
      {},
      insertStoragePersister({ key: 'user', storeName: 'app' }),
    );
  },
);
