import { craftEffect, craftService, state } from '../craft-runtime';

export const { Sync } = craftService(
  { name: 'Sync', scope: 'global' },
  function* () {
    const selectedId = yield* state('selectedId', '1');
    const result = yield* state('result', null);
    const sync = craftEffect('sync', function* () {
      yield* result.set(yield* selectedId());
    });
    return { selectedId, result, sync };
  },
);
