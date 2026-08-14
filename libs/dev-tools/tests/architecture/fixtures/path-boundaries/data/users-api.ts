import { craftService } from '../../craft-runtime';

export const { UsersApi } = craftService(
  { name: 'UsersApi', scope: 'global', browserBoundary: true },
  () => ({}),
);
