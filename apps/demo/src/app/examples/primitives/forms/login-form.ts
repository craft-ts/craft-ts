/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import {
  button,
  craftComponent,
  div,
  fieldControl,
  fieldErrorNode,
  form,
  ifNode,
  input,
  label,
  p,
  heading,
} from '@craft-ts/component';
import {
  cEmail,
  cMinLength,
  cRequired,
  craftComputed,
  CraftFieldDirective,
  insertForm,
  insertFormAttributes,
  insertFormSubmit,
  insertNoopTypingAnchor,
  insertSelectFormTree,
  mutation,
  state,
  type ValidatedFormValue,
} from '@craft-ts/core';

type LoginData = {
  email: string;
  password: string;
};

const LoginFormComponent = craftComponent(
  'LoginFormComponent',
  {
    styles: `
      :scope{box-sizing:border-box;max-width:420px;display:grid;gap:1rem;margin:2rem auto;padding:2rem;border:1px solid #e2e8f0;border-radius:12px;color:#1e293b;background:#fff;box-shadow:0 8px 24px rgba(15,23,42,.08)}
      :scope h2{margin:0;color:#0f172a}.login-field{display:grid;gap:.35rem}.login-field label{font-weight:600;color:#334155}input{box-sizing:border-box;width:100%;padding:.75rem;border:1px solid #cbd5e1;border-radius:6px;background:#fff}.login-error{margin:0;color:#b91c1c}.login-field + .login-error{margin-top:.25rem}
      :scope button{justify-self:start;padding:.65rem 1rem;border:0;border-radius:6px;color:#fff;background:#2563eb;font-weight:600;cursor:pointer}.login-field:focus-within input{border-color:#2563eb;outline:2px solid #bfdbfe;outline-offset:1px}
    `,
  },
  function* () {
    const submitted = yield* mutation('submitted', {
      method: (value: NonNullable<ValidatedFormValue<LoginData>>) => value,
      loader: function* ({ params }) {
        return params;
      },
    });
    const loginForm = yield* state(
      'loginForm',
      { email: '', password: '' } satisfies LoginData,
      insertForm(
        insertFormSubmit(submitted),
        insertSelectFormTree(
          'email',
          insertNoopTypingAnchor,
          insertFormAttributes(() => ({
            validators: [cRequired(), cEmail()],
          })),
        ),
        insertSelectFormTree(
          'password',
          insertNoopTypingAnchor,
          insertFormAttributes(() => ({
            validators: [cRequired(), cMinLength({ minLength: 6 })],
          })),
        ),
        ({ field }) => ({
          showSuccess: craftComputed(
            'showSuccess',
            () => submitted.hasValue() && field.valid(),
          ),
        }),
      ),
    );
    return {
      loginForm,
      email: fieldControl('email'),
      password: fieldControl('password'),
    };
  },
  ({ loginForm, email, password }) => {
    return (
      // exceptions are volontary handled at different place for demo reasons
      form('login',
        {
          *submit(event) {
            event.preventDefault();
            yield* loginForm.form.submit();
          },
        },
        [
          heading('Login form'),
          div({ class: 'login-field' }, [
            label({ ...email.label, htmlFor: 'email' }, 'Email'),
            input('email', { ...email.input, type: 'email' }).pipe(
              CraftFieldDirective(loginForm.form.selectEmail()),
            ),
            p({ ...email.description }, 'We never share your email.'),
          ]),
          div({ class: 'login-field' }, [
            label({ ...password.label, htmlFor: 'password' }, 'Password'),
            input('password', { ...password.input, type: 'password' })
              .pipe(CraftFieldDirective(loginForm.form.selectPassword()))
              .pipe(
                fieldErrorNode.partial({
                  required: () =>
                    p({ class: 'login-error' }, 'Password is required.'),
                }),
              ),
            p({ ...password.description }, 'Use at least 6 characters.'),
          ]),
          ifNode(loginForm.form.showSuccess, () =>
            p('✅ Login form submitted.'),
          ),
          button('submit', { type: 'submit' }, 'Sign in'),
        ],
      ).pipe(
        fieldErrorNode.exhaustive({
          email: {
            required: () => p({ class: 'login-error' }, 'Email is required.'),
            email: () => p({ class: 'login-error' }, 'Enter a valid email.'),
          },
          password: {
            minLength: ({ exception }) =>
              p(
                { class: 'login-error' },
                `Use at least ${exception.payload} characters.`,
              ),
          },
        }),
      )
    );
  },
);

export default LoginFormComponent;
