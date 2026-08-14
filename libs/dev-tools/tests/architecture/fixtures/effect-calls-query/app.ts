import { craftEffect, craftService, query, state } from '../craft-runtime';

export const { Sync } = craftService(
  { name: 'Sync', scope: 'global' },
  function* () {
    const selectedId = yield* state('selectedId', '1');
    const usersQuery = yield* query('usersQuery', {});
    const sync = craftEffect('sync', function* () {
      yield* usersQuery.call(yield* selectedId());
    });
    return { selectedId, usersQuery, sync };
  },
);
