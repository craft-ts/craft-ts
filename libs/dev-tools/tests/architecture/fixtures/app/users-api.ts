import { craftService, CraftHttpClient } from '../craft-runtime';
import { craftExpose } from '@craft-ts/core';

export const { UsersApi } = craftService(
  { name: 'UsersApi', providedIn: 'global', browserBoundary: true },
  function* () {
    const users = yield* CraftHttpClient.get(({ response }) => ({
      url: 'users',
      success: response(),
    }));
    yield* craftExpose('users', users);
  },
);
