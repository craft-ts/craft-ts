import {
  craftService,
  craftUnique,
  insertStoragePersister,
  query,
} from '../craft-runtime';

export const { UserList, provideUserList } = craftService(
  { name: 'UserList', providedIn: 'toProvide' },
  function* () {
    const list = yield* query(
      'userList',
      {},
      insertStoragePersister(
        craftUnique({ key: 'user', storeName: 'shop' }),
      ),
    );
    return { list };
  },
);
