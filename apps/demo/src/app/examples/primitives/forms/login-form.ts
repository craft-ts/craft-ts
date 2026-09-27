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
  craftUse,
  craftPrivate,
  craftExpose,
} from '@craft-ts/core';
import { example } from '../../shared/example.style';

type LoginData = {
  email: string;
  password: string;
};

export const { LoginFormView, provideLoginFormView } = craftService(
  { name: 'loginFormView', providedIn: 'toProvide' },
  function* () {
    const submitted = yield* craftPrivate(mutation('submitted', {
      method: (value: NonNullable<ValidatedFormValue<LoginData>>) => value,
      loader: function* ({ params }) {
        return params;
      },
    }));
    yield* state(
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
          showSuccess: craftUse(craftComputed(
            'showSuccess',
            () => submitted.hasValue() && field.valid(),
          )),
        }),
      ),
    );
    yield* craftExpose('email', fieldControl('email'));
    yield* craftExpose('password', fieldControl('password'));
  },
);

const LoginFormComponent = craftComponent(
  'LoginFormComponent',
  {
    providers: [provideLoginFormView()],
  },
  function* () {
    const { loginForm, email, password } = yield* LoginFormView();

    return (
      // exceptions are volontary handled at different place for demo reasons
      form(
        'login',
        {
          class: example.card,
          *submit(event) {
            event.preventDefault();
            yield* loginForm.form.submit();
          },
        },
        [
          heading({ class: example.title }, 'Login form'),
          div({ class: example.fieldset }, [
            label({ ...email.label, class: example.label, htmlFor: 'email' }, 'Email'),
            input('email', { ...email.input, class: example.input, 'data-exampleField': 'wide', type: 'email' }).pipe(
              CraftFieldDirective(loginForm.form.selectEmail()),
            ),
            p({ ...email.description, class: example.hint }, 'We never share your email.'),
          ]),
          div({ class: example.fieldset }, [
            label({ ...password.label, class: example.label, htmlFor: 'password' }, 'Password'),
            input('password', { ...password.input, class: example.input, 'data-exampleField': 'wide', type: 'password' })
              .pipe(CraftFieldDirective(loginForm.form.selectPassword()))
              .pipe(
                fieldErrorNode.partial({
                  required: () =>
                    p({ class: example.text, 'data-exampleText': 'error' }, 'Password is required.'),
                }),
              ),
            p({ ...password.description, class: example.hint }, 'Use at least 6 characters.'),
          ]),
          ifNode(loginForm.form.showSuccess, () =>
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
            minLength: ({ exception }) =>
              p(
                { class: example.text, 'data-exampleText': 'error' },
                `Use at least ${exception.payload} characters.`,
              ),
          },
        }),
      )
    );
  },
);

export default LoginFormComponent;
