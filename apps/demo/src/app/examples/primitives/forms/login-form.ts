import { computed, signal } from '@angular/core';
import {
  button,
  component,
  div,
  form,
  h2,
  input,
  label,
  p,
} from '@craft-ng/component';
import { componentMonitoring, provideHostName } from '@craft-ng/core';

const LoginFormComponent = component(
  {
    providers: [provideHostName('component:LoginFormComponent')],
    styles: `
      .login-form{max-width:420px;display:grid;gap:1rem;padding:2rem;border:1px solid #e2e8f0;border-radius:12px}.login-field{display:grid;gap:.35rem}.login-form input{padding:.75rem;border:1px solid #cbd5e1;border-radius:6px}.login-error{color:#b91c1c}
    `,
  },
  () => {
    componentMonitoring();
    const email = signal('');
    const password = signal('');
    const submitted = signal(false);
    const valid = computed(
      () => email().includes('@') && password().length >= 6,
    );
    const submit = () => submitted.set(true);
    return { email, password, submitted, valid, submit };
  },
  ({ email, password, submitted, valid, submit }) =>
    form(
      {
        class: 'login-form',
        submit: (event) => {
          event.preventDefault();
          submit();
        },
      },
      [
        h2('Login form'),
        div({ class: 'login-field' }, [
          label({ htmlFor: 'email' }, 'Email'),
          input({
            id: 'email',
            type: 'email',
            value: email(),
            input: (event) =>
              email.set((event.target as HTMLInputElement).value),
          }),
        ]),
        div({ class: 'login-field' }, [
          label({ htmlFor: 'password' }, 'Password'),
          input({
            id: 'password',
            type: 'password',
            value: password(),
            input: (event) =>
              password.set((event.target as HTMLInputElement).value),
          }),
        ]),
        submitted() && !valid()
          ? p(
              { class: 'login-error' },
              'Enter a valid email and a password of at least 6 characters.',
            )
          : [],
        submitted() && valid() ? p('✅ Login form submitted.') : [],
        button({ type: 'submit' }, 'Sign in'),
      ],
    ),
);

export default LoginFormComponent;
