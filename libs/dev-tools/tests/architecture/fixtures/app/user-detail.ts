import {
  craftService,
  craftUnique,
  insertStoragePersister,
  query,
} from '../craft-runtime';
import { UsersApi } from './users-api';

export const { UserDetail, provideUserDetail } = craftService(
  { name: 'UserDetail', providedIn: 'toProvide' },
  function* () {
    yield* UsersApi();
    yield* query(
      'detail',
      {},
      insertStoragePersister(
        craftUnique({ key: 'user-detail', storeName: 'shop' }),
      ),
    );
  },
);
