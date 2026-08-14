import { craftComponent, div } from '../craft-runtime';
import { Cart } from './cart';

export const CheckoutPage = craftComponent(
  'CheckoutPage',
  {},
  function* () {
    yield* Cart();
    return {};
  },
  () => div([]),
);
