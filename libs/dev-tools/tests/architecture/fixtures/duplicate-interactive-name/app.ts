import { button, craftComponent, input } from '../craft-runtime';

export const Login = craftComponent(
  'Login',
  {},
  () => ({}),
  () => button('save', { type: 'button' }, 'Save'),
);

export const Checkout = craftComponent(
  'Checkout',
  {},
  () => ({}),
  () => input('save', { type: 'text' }),
);
