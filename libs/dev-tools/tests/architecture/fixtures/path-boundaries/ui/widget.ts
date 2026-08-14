import { craftService } from '../../craft-runtime';
import { Auth } from '../shared/auth';

export const { Widget } = craftService(
  { name: 'Widget', scope: 'global' },
  function* () {
    yield* Auth();
    return {};
  },
);
