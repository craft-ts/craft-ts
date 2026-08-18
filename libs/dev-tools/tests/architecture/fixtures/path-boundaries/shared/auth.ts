import { craftService } from '../../craft-runtime';

export const { Auth } = craftService(
  { name: 'Auth', providedIn: 'global' },
  () => ({}),
);
