# Submitting a form

`insertFormSubmit` connects the form to a [mutation](/guide/state/mutations), so
submission gets its loading state, its failure state and — the point — a **typed
union of the exceptions submission can produce**, inferred from that mutation.

**Use it when** the form writes somewhere.
**Reshape the codes** with the `exceptions` pipeline when the server's vocabulary
isn't the one your UI should show.

```ts
const { updateUserMutation } = mutation('updateUserMutation', {
  method: (data: ValidatedFormValue<UserForm>) => data,
  loader: function* ({ params: user }) {
    return yield* CraftHttpClient.patch(({ response, status }) => ({
      url: '/api/users',
      body: user,
      success: response<User>(),
      exceptions: [
        function* ({ status }) {
          if (!(yield* status(409))) {
            return;
          }

          return craftException(
            { _tag: 'USER_EMAIL_ALREADY_EXISTS' },
            { message: 'This email is already used' as const },
          );
        },
      ],
    }));
  },
});

const { userFormState } = state(
  'userFormState',
  { name: '', email: '' },
  insertForm(
    insertSelectFormTree(
      'name',
      insertNoopTypingAnchor,
      insertFormAttributes(() => ({ validators: [cRequired()] })),
    ),
    insertSelectFormTree(
      'email',
      insertNoopTypingAnchor,
      insertFormAttributes(() => ({ validators: [cRequired(), cEmail()] })),
    ),
    insertFormSubmit(updateUserMutation, {
      success: () => {
        console.log('Form submitted successfully');
        return undefined;
      },
      exceptions: [
        ({ omit }) => omit(['USER_EMAIL_ALREADY_EXISTS']),
        ({ submitCraftResource }) => {
          const emailConflict =
            submitCraftResource.exceptions()?.loader?.USER_EMAIL_ALREADY_EXISTS;

          if (!emailConflict) return undefined;

          return craftException(
            { _tag: 'EMAIL_NOT_AVAILABLE' },
            emailConflict.payload,
          );
        },
      ],
    }),
  ),
);

// Submit the form
userFormState.form().submit(); // Automatically triggers the mutation

// Submit exceptions are inferred from the mutation and the `exceptions` rules.
const submitErrors = userFormState.form().submitExceptions();
const firstSubmitError = submitErrors[0]?.code; // 'EMAIL_NOT_AVAILABLE'
```

::: warning What `success` is for
`success` runs inside the **derivation of the submit exception list**, and its
return value is appended to that list. Its purpose is to raise an exception the
server reported alongside a successful response — not to run side effects.
Resetting the form, navigating or showing a toast from there mutates state
inside a computation and re-runs whenever the exceptions recompute. Drive those
from your own code after `submit()`, or from the mutation itself.

The example above logs from `success` only to show where the hook fires.
:::

`insertFormSubmit` preserves mutation exceptions by default. Use `exceptions` as
an ordered pipeline when you want to refine the submit exceptions exposed by the
form:

```ts
insertFormSubmit(updateUserMutation, {
  exceptions: [
    // `omit` autocompletes the exception codes produced by `updateUserMutation`.
    ({ omit }) => omit(['USER_EMAIL_ALREADY_EXISTS']),

    // Returning a Craft exception appends it to the current submit exceptions.
    ({ submitCraftResource }) => {
      if (submitCraftResource.exceptions()?.loader?.USER_EMAIL_ALREADY_EXISTS) {
        return craftException(
          { _tag: 'EMAIL_NOT_AVAILABLE' },
          { message: 'This email is already used' as const },
        );
      }

      return undefined;
    },
  ],
});
```

Returning an array, like `omit(...)`, replaces the current submit exception list.
Returning a single `craftException(...)` adds it. The final inferred union is
available through:

```ts
const submitExceptions = userFormState.form().submitExceptions();
const aggregatedSubmitExceptions = userFormState.form().exceptions().submit;
```

## See Also

- [Forms overview](/guide/forms/)
- [Form exceptions](/guide/forms/exceptions)
