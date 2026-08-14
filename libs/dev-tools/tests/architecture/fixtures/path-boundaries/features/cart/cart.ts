import { craftService } from '../../../craft-runtime';

export const { Cart } = craftService(
  { name: 'Cart', scope: 'global' },
  () => ({}),
);
