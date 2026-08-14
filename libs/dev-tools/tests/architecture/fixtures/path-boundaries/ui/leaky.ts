import { craftService } from '../../craft-runtime';
import { UsersApi } from '../data/users-api';

export const { LeakyWidget } = craftService(
  { name: 'LeakyWidget', scope: 'global' },
  function* () {
    yield* UsersApi();
    return {};
  },
);
