import { craftEffect, craftService, mutation } from '../craft-runtime';

export const { Sync } = craftService(
  { name: 'Sync', providedIn: 'global' },
  function* () {
    const save = yield* mutation('save', {});
    yield* craftEffect('poll', function* () {
      yield* save();
    });
  },
);
