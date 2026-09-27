import { CraftHttpClient, craftEffect, craftService } from '../craft-runtime';

export const { Sync } = craftService(
  { name: 'Sync', providedIn: 'global' },
  function* () {
    yield* craftEffect('poll', function* () {
      yield* CraftHttpClient.get(({ response }) => ({
        url: 'users',
        success: response(),
      }));
    });
  },
);
