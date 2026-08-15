import { craftComponent, div } from '../craft-runtime';
import { UserList } from './user-list';

export const AdminPage = craftComponent(
  'AdminPage',
  {},
  function* () {
    yield* UserList();
    return {};
  },
  () => div([]),
);
