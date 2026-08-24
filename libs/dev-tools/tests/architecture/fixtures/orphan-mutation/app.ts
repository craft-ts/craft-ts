import { craftService, mutation, query } from '../craft-runtime';

export const { Users } = craftService(
  { name: 'Users', providedIn: 'global' },
  function* () {
    const save = yield* mutation('save', {});
    const user = yield* query('user', {});
    return { save, user };
  },
);
