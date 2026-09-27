import { craftService, mutation, query } from '../craft-runtime';

export const { Users } = craftService(
  { name: 'Users', providedIn: 'global' },
  function* () {
    yield* mutation('save', {});
    yield* query('user', {});
  },
);
