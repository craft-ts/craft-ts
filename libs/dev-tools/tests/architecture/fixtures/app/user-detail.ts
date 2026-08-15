import {
  craftService,
  craftUnique,
  insertStoragePersister,
  query,
} from '../craft-runtime';
import { UsersApi } from './users-api';

export const { UserDetail, provideUserDetail } = craftService(
  { name: 'UserDetail', scope: 'toProvide' },
  function* () {
    yield* UsersApi();
    const detail = yield* query(
      'userDetail',
      {},
      insertStoragePersister(
        craftUnique({ key: 'user-detail', storeName: 'shop' }),
      ),
    );
    return { detail };
  },
);
