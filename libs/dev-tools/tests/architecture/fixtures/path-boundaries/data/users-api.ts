import { craftService } from '../../craft-runtime';

export const { UsersApi } = craftService(
  { name: 'UsersApi', providedIn: 'global', browserBoundary: true },
  () => ({}),
);
