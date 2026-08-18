import { craftEffect, craftService, mutation } from '../craft-runtime';

export const { Sync } = craftService(
  { name: 'Sync', providedIn: 'global' },
  function* () {
    const save = yield* mutation('save', {});
    const poll = craftEffect('poll', function* () {
      yield* save();
    });
    return { save, poll };
  },
);
