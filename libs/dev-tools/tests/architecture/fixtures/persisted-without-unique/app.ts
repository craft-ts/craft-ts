import { craftService, insertStoragePersister, query } from '../craft-runtime';

export const { Users } = craftService(
  { name: 'Users', providedIn: 'global' },
  function* () {
    const leaked = yield* query(
      'leaked',
      {},
      insertStoragePersister({ key: 'user', storeName: 'app' }),
    );
    return { leaked };
  },
);
