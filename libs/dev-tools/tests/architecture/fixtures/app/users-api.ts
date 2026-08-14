import { craftService, CraftHttpClient } from '../craft-runtime';

export const { UsersApi } = craftService(
  { name: 'UsersApi', scope: 'global', browserBoundary: true },
  function* () {
    const users = yield* CraftHttpClient.get(({ response }) => ({
      url: 'users',
      success: response(),
    }));
    return { users };
  },
);
