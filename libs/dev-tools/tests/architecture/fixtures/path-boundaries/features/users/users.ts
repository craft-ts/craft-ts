import { craftService } from '../../../craft-runtime';
import { Auth } from '../../shared/auth';
import { Cart } from '../cart/cart';

export const { Users } = craftService(
  { name: 'Users', providedIn: 'global' },
  function* () {
    yield* Auth();
    yield* Cart();
    return {};
  },
);
