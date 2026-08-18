import {
  craftService,
  craftUnique,
  insertStoragePersister,
  query,
} from '../craft-runtime';

export const { UserDetail, provideUserDetail } = craftService(
  { name: 'UserDetail', providedIn: 'toProvide' },
  function* () {
    const detail = yield* query(
      'userDetail',
      {},
      insertStoragePersister(
        craftUnique({ storeName: 'shop', key: 'user' }),
      ),
    );
    return { detail };
  },
);
