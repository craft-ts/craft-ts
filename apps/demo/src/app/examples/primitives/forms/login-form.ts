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
  craftService,
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
  craftPrivate,
  craftExpose,
} from '@craft-ts/core';
import { example } from '../../shared/example.style';

type LoginData = {
  email: string;
  password: string;
};

const email = fieldControl('email');
const password = fieldControl('password');

export const { LoginFormView, provideLoginFormView } = craftService(
  { name: 'loginFormView', providedIn: 'toProvide' },
  function* () {
    const submitted = yield* craftPrivate(mutation('submitted', {
      method: (value: NonNullable<ValidatedFormValue<LoginData>>) => value,
      loader: function* ({ params }) {
        return params;
      },
    }));
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
        function* ({ field }) {
          return {
            showSuccess: yield* craftComputed(
              'showSuccess',
              () => submitted.hasValue() && field.valid(),
            ),
          };
        },
      ),
    );
    yield* craftExpose('emailField', loginForm.form.selectEmail());
    yield* craftExpose('passwordField', loginForm.form.selectPassword());
  },
);

const LoginFormComponent = craftComponent(
  'LoginFormComponent',
  {
    providers: [provideLoginFormView()],
  },
  () => (
        // exceptions are volontary handled at different place for demo reasons
        form(
          'login',
          {
            class: example.card,
            *submit(event) {
              event.preventDefault();
              yield* LoginFormView.loginForm.form.submit();
            },
          },
          [
            heading({ class: example.title }, 'Login form'),
            div({ class: example.fieldset }, [
              label({ ...email.label, class: example.label, htmlFor: 'email' }, 'Email'),
              input('email', { ...email.input, class: example.input, 'data-exampleField': 'wide', type: 'email' }).pipe(
                CraftFieldDirective(LoginFormView.emailField),
              ),
              p({ ...email.description, class: example.hint }, 'We never share your email.'),
            ]),
            div({ class: example.fieldset }, [
              label({ ...password.label, class: example.label, htmlFor: 'password' }, 'Password'),
              input('password', { ...password.input, class: example.input, 'data-exampleField': 'wide', type: 'password' })
                .pipe(CraftFieldDirective(LoginFormView.passwordField)),
              p({ ...password.description, class: example.hint }, 'Use at least 6 characters.'),
            ]),
            ifNode(LoginFormView.loginForm.form.showSuccess, () =>
              p('✅ Login form submitted.'),
            ),
            button('submit', { class: example.button, 'data-exampleButton': 'primary', type: 'submit' }, 'Sign in'),
          ],
        ).pipe(
          fieldErrorNode.exhaustive({
            email: {
              required: () => p({ class: example.text, 'data-exampleText': 'error' }, 'Email is required.'),
              email: () => p({ class: example.text, 'data-exampleText': 'error' }, 'Enter a valid email.'),
            },
            password: {
              required: () => p({ class: example.text, 'data-exampleText': 'error' }, 'Password is required.'),
              minLength: ({ exception }) =>
                p(
                  { class: example.text, 'data-exampleText': 'error' },
                  `Use at least ${exception.payload} characters.`,
                ),
            },
          }),
        )
      ),
);

export default LoginFormComponent;
