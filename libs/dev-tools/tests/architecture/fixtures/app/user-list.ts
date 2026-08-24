import {
  craftService,
  craftUnique,
  insertStoragePersister,
  query,
} from '../craft-runtime';
import { UsersApi } from './users-api';

export const { UserList, provideUserList } = craftService(
  { name: 'UserList', providedIn: 'toProvide' },
  function* () {
    yield* UsersApi();
    const list = yield* query(
      'userList',
      {},
      insertStoragePersister(
        craftUnique({ storeName: 'shop', key: 'user-list' }),
      ),
    );
    return { list };
  },
);
