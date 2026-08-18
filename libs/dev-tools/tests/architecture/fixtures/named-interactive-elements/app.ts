import { button, craftComponent, input } from '../craft-runtime';

export const Login = craftComponent(
  'Login',
  {},
  () => ({}),
  () => [
    input('loginEmail', { type: 'email' }),
    button('loginSubmit', { type: 'submit' }, 'Sign in'),
  ],
);
