import { craftRoute, craftRoutes } from '../craft-runtime';
import { provideUserDetail } from './user-detail';
import { provideUserList } from './user-list';

export const appRoutes = craftRoutes('appRoutes', [
  craftRoute('/users', {
    path: '/users',
    providers: [provideUserList()],
  }),
  craftRoute('/users/:id', {
    path: '/users/:id',
    providers: [provideUserDetail()],
  }),
]);
