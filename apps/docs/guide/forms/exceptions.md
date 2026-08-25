# Form exception handling

Form validation exceptions are typed UI obligations. A component must handle
every reachable exception in its template or forward the remaining cases to a
component boundary before it can be rendered, mounted, or used by a route.

**Read this when** you render validation messages, split them between several
locations, or validate a group of fields.

## Reading exceptions as values

Validators do not throw. They keep the field and form invalid and expose their
exceptions as signals:

```ts
const email = loginForm.form.selectEmail();

email.errors();
email.exceptions().list;
email.exceptions().byValidator.cRequired;
email.firstLeftFailedValidation();
email.lastRightFailedValidation();
```

Handling an exception only renders its message. It does not remove the
exception or make the field valid.

## Case 1: handle every exception beside one field

`CraftFieldDirective` carries the field's exact validator cases onto the VNode.
An exhaustive block must provide exactly one handler for every reachable code:

```ts
input({ id: 'email', type: 'email' })
  .pipe(CraftFieldDirective(loginForm.form.selectEmail()))
  .pipe(
    fieldErrorNode.exhaustive({
      required: () => p('Email is required.'),
      email: () => p('Enter a valid email.'),
    }),
  );
```

A missing handler and an unreachable extra handler are both TypeScript errors.

## Case 2: handle only some exceptions locally

Use `partial` when an exception belongs beside the control while the remaining
cases should continue to an enclosing boundary:

```ts
input({ id: 'password', type: 'password' })
  .pipe(CraftFieldDirective(loginForm.form.selectPassword()))
  .pipe(
    fieldErrorNode.partial({
      required: () => p('Password is required.'),
    }),
  );
```

If the field also declares `minLength`, that case remains in the component's
contract until another `partial` or `exhaustive` block handles it.

## Case 3: handle several fields at a component boundary

At a boundary that receives more than one field path, group handlers by their
static path. Identical codes on different fields remain separate obligations:

```ts
const SafeLoginForm = BaseLoginForm.pipe(
  fieldErrorNode.exhaustive({
    email: {
      required: () => p('Email is required.'),
      email: () => p('Enter a valid email.'),
    },
    password: {
      required: () => p('Password is required.'),
      minLength: ({ exception }) =>
        p(`Use at least ${exception.payload} characters.`),
    },
  }),
);
```

## Case 4: handle a group or cross-field validator

A group validator is declared on an object branch rather than on one leaf
control. Materialize that branch in the component logic and return it from the
factory:

```ts
function* registrationLogic() {
  const registration = yield* state(
    'registration',
    {
      credentials: {
        password: '',
        confirmation: '',
      },
    },
    insertForm(
      insertSelectFormTree(
        'credentials',
        insertNoopTypingAnchor,
        insertFormAttributes(({ field }) => ({
          validators: [
            cValidate({
              name: 'passwordsMatch',
              validWhen: () =>
                field.value().password === field.value().confirmation,
              exception: () =>
                craftException({ _tag: 'passwordMismatch' }, undefined),
            }),
          ],
        })),
      ),
    ),
  );

  const credentials = registration.form.selectCredentials();
  return { registration, credentials };
}
```

The component logic now declares the typed obligation
`credentials.passwordMismatch`. The group itself does not need a
`CraftFieldDirective`; only its leaf controls need their usual DOM bindings.

### Handle the group in the template

A grouped handler on an enclosing VNode consumes the logic-level obligation:

```ts
({ credentials }) =>
  div([
    input({ type: 'password' }).pipe(CraftFieldDirective(credentials.password)),
    input({ type: 'password' }).pipe(
      CraftFieldDirective(credentials.confirmation),
    ),
  ]).pipe(
    fieldErrorNode.exhaustive({
      credentials: {
        passwordMismatch: () => p('Passwords do not match.'),
      },
    }),
  );
```

The exception source is registered from the component logic, independently of
a DOM binding for the group.

### Forward the group to the component boundary

The template may leave the group case unresolved and let the component
boundary handle it:

```ts
const SafeRegistrationForm = BaseRegistrationForm.pipe(
  fieldErrorNode.exhaustive({
    credentials: {
      passwordMismatch: () => p('Passwords do not match.'),
    },
  }),
);
```

If neither location handles it, using the component is a compile-time error:

```ts
// TypeScript error: credentials.passwordMismatch remains unhandled.
loadCraftComponent(async () => BaseRegistrationForm);
```

## Visibility: blur and submit

By default, a block consumes `visibleExceptions`. A validation exception is
visible when its field or group is touched, or after a submit attempt:

```ts
insertFormAttributes(() => ({
  validators: [cRequired()],
  exceptionVisibility: { anyOf: ['touched', 'submitted'] },
}));
```

After a blur, only the touched field and its parent groups reveal their
remaining exceptions. A submit attempt reveals every remaining exception in
the form. Resetting the form clears `dirty`, `touched`, and `submitted`, so the
messages become hidden again.

Use `visibility: 'always'`, another `anyOf` combination, or a predicate to
override this policy on one block. `mode` controls whether the first or all
matching exceptions render, and `position` selects `before` or `after`.

## Submission and schema exceptions

`insertFormSubmit` exposes submission exceptions separately from field
validation cases. `insertFormSchema` projects issues with paths onto matching
fields and leaves pathless issues on the form root through
`schemaExceptions()`.

## See also

- [Validation](/guide/forms/validation)
- [Nested forms](/guide/forms/nested)
- [Submitting a form](/guide/forms/submit)
- [Exceptions as values](/guide/concepts/exceptions)
