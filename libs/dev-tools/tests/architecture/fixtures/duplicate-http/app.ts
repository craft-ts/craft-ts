import { craftService, CraftHttpClient } from '../craft-runtime';

export const { UsersApi } = craftService(
  { name: 'UsersApi', providedIn: 'global', browserBoundary: true },
  function* () {
    yield* CraftHttpClient.get(({ response }) => ({
      url: 'users',
      success: response(),
    }));
  },
);

export const { ProfileApi } = craftService(
  { name: 'ProfileApi', providedIn: 'global', browserBoundary: true },
  function* () {
    yield* CraftHttpClient.get(({ response }) => ({
      url: 'users',
      success: response(),
    }));
  },
);
