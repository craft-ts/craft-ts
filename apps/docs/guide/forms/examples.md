# Complete form examples

Two forms end to end, assembling the pieces from the other pages: a flat creation
form with validation and submission, then a nested one.

**Read this after** [the overview](/guide/forms/) — these examples don't
introduce anything new, they show the parts fitting together.

## Creation form with validation

```ts
interface User {
  name: string;
  email: string;
  age: number;
}

const { createUserMutation } = mutation('createUserMutation', {
  method: (data: ValidatedFormValue<User>) => data,
  loader: function* ({ params: user }) {
    return yield* CraftHttpClient.update(({ response }) => ({
      url: '/api/users',
      body: user,
      success: response<User>(),
    }));
  },
});

const { userFormState } = state(
  'userFormState',
  { name: '', email: '', age: 0 } satisfies User,
  insertForm(
    insertSelectFormTree(
      'name',
      insertNoopTypingAnchor,
      insertFormAttributes(() => ({
        validators: [cRequired()],
      })),
    ),
    insertSelectFormTree(
      'email',
      insertNoopTypingAnchor,
      insertFormAttributes(() => ({
        validators: [cRequired(), cEmail()],
      })),
    ),
    insertSelectFormTree(
      'age',
      insertNoopTypingAnchor,
      insertFormAttributes(() => ({
        validators: [cMin({ min: 18 })],
      })),
    ),
    insertFormSubmit(createUserMutation),
  ),
);
```

## Complex Nested Form

```ts
interface Address {
  street: string;
  city: string;
  zipCode: string;
}

interface User {
  name: string;
  email: string;
  addresses: Address[];
}

const { userFormState } = state(
  'userFormState',
  {
    name: '',
    email: '',
    addresses: [],
  } satisfies User,
  insertForm(
    insertSelectFormTree(
      'name',
      insertNoopTypingAnchor,
      insertFormAttributes(() => ({
        validators: [cRequired()],
      })),
    ),
    insertSelectFormTree(
      'email',
      insertNoopTypingAnchor,
      insertFormAttributes(() => ({
        validators: [cRequired(), cEmail()],
      })),
    ),
    insertSelectFormTree(
      'addresses',
      insertNoopTypingAnchor,
      insertSelectFormTree(
        'street',
        insertNoopTypingAnchor,
        insertFormAttributes(() => ({
          validators: [cRequired()],
        })),
      ),
      insertSelectFormTree(
        'city',
        insertNoopTypingAnchor,
        insertFormAttributes(() => ({
          validators: [cRequired()],
        })),
      ),
      insertSelectFormTree(
        'zipCode',
        insertNoopTypingAnchor,
        insertFormAttributes(() => ({
          validators: [cRequired(), cPattern({ pattern: /^\d{5}$/ })],
        })),
      ),
    ),
    insertSelectFormTree(
      'address',
      insertNoopTypingAnchor,
      insertFormAttributes(() => ({
        validators: [cRequired(), cMinLength({ minLength: 5 })],
      })),
    ),
  ),
);
```

## See Also

- [Forms overview](/guide/forms/)
- [Validators](/guide/forms/validation)
- [Nested forms](/guide/forms/nested)
