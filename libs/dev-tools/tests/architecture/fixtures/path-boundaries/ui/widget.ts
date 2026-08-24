import { craftService } from '../../craft-runtime';
import { Auth } from '../shared/auth';

export const { Widget } = craftService(
  { name: 'Widget', providedIn: 'global' },
  function* () {
    yield* Auth();
    return {};
  },
);
