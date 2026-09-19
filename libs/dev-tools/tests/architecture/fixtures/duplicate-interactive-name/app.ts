import { button, craftComponent, input } from '../craft-runtime';

export const Login = craftComponent('Login', {}, function* () {
  return button('save', { type: 'button' }, 'Save');
});

export const Checkout = craftComponent('Checkout', {}, function* () {
  return input('save', { type: 'text' });
});
