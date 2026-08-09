import {
  button,
  craftComponent,
  div,
  form,
  h2,
  ifBlock,
  input,
  label,
  p,
} from '@craft-ng/component';
import { craftComputed, state } from '@craft-ng/core';

const LoginFormComponent = craftComponent(
  'LoginFormComponent',
  {
    styles: `
      :scope{max-width:420px;display:grid;gap:1rem;padding:2rem;border:1px solid #e2e8f0;border-radius:12px}.login-field{display:grid;gap:.35rem}input{padding:.75rem;border:1px solid #cbd5e1;border-radius:6px}.login-error{color:#b91c1c}
    `,
  },
  function* () {
    const email = yield* state('email', '', ({ set }) => ({
      setEmail: (value: string) => set(value),
    }));
    const password = yield* state('password', '', ({ set }) => ({
      setPassword: (value: string) => set(value),
    }));
    const submitted = yield* state('submitted', false, ({ set }) => ({
      submit: () => set(true),
    }));
    const valid = craftComputed(
      'valid',
      () => email().includes('@') && password().length >= 6,
    );
    const showError = craftComputed(
      'showError',
      () => submitted() && !valid(),
    );
    const showSuccess = craftComputed(
      'showSuccess',
      () => submitted() && valid(),
    );
    return {
      email,
      password,
      submitted,
      valid,
      showError,
      showSuccess,
      submit: submitted.submit,
      setEmail: email.setEmail,
      setPassword: password.setPassword,
    };
  },
  ({ email, password, submit, setEmail, setPassword, showError, showSuccess }) =>
    form(
      {
        *submit(event) {
          event.preventDefault();
          yield* submit();
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
            *input(event) {
              yield* setEmail((event.target as HTMLInputElement).value);
            },
          }),
        ]),
        div({ class: 'login-field' }, [
          label({ htmlFor: 'password' }, 'Password'),
          input({
            id: 'password',
            type: 'password',
            value: password(),
            *input(event) {
              yield* setPassword((event.target as HTMLInputElement).value);
            },
          }),
        ]),
        ifBlock(
          showError,
          () =>
            p(
              { class: 'login-error' },
              'Enter a valid email and a password of at least 6 characters.',
            ),
        ),
        ifBlock(showSuccess, () => p('✅ Login form submitted.')),
        button({ type: 'submit' }, 'Sign in'),
      ],
    ),
);

export default LoginFormComponent;
