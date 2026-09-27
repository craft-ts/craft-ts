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
    yield* query(
      'list',
      {},
      insertStoragePersister(
        craftUnique({ storeName: 'shop', key: 'user-list' }),
      ),
    );
  },
);
