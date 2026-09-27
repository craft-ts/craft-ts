import { craftEffect, craftService, query, state } from '../craft-runtime';

export const { Sync } = craftService(
  { name: 'Sync', providedIn: 'global' },
  function* () {
    const selectedId = yield* state('selectedId', '1');
    const usersQuery = yield* query('usersQuery', {});
    yield* craftEffect('sync', function* () {
      yield* usersQuery.call(yield* selectedId());
    });
  },
);
