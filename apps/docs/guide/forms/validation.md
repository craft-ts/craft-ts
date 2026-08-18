# Validators

Validators are declared on a field and produce **typed exceptions** — so the
errors a field can raise are known to the compiler, not discovered at runtime.

**Start with the built-ins** below; reach for `cValidate` / `cAsyncValidate`
when a rule is specific to your domain.

@craft-ts provides a complete set of validators with structured exception handling:

## Schema validation

Use `insertFormSchema` when the rules describe the complete form value rather
than one field at a time. It accepts any schema compatible with
`StandardSchemaV1`, including current versions of Zod, Valibot, ArkType and
Effect Schema — the latter through
[`Schema.toStandardSchemaV1`](/guide/state/schema-validation#effect-schema).

```ts
import { z } from 'zod';
import { craftUse, insertForm, insertFormSchema, state } from '@craft-ts/core';

const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  address: z.object({
    zip: z.string().length(5),
  }),
});

const userFormState = craftUse(
  state(
    'userForm',
    {
      name: '',
      email: '',
      address: { zip: '' },
    },
    insertForm(insertFormSchema(userSchema)),
  ),
);
const form = userFormState.form;
```

Issues with a Standard Schema path are projected onto the matching field:

```ts
form.email.errors();
form.address.zip.errors();
form.schemaExceptions(); // also includes root/unmaterialized issues
```

Issues without a path remain on the form root. The form is invalid while any
schema issue exists, so `validatedFormValue()` is `undefined` and
`insertFormSubmit` does not call its mutation.

Schema validation is synchronous in forms. Use `cAsyncValidate` for an
asynchronous field rule or an async resource for a server-side check.

### Schema transformations

Following the Standard Schema form convention, validation does not replace the
form's input value with the schema output:

```ts
const schema = z.object({
  age: z.string().transform(Number),
});
```

The form keeps `age` as a string. If the submit payload needs the transformed
number, put the same schema on the mutation's `methodSchema`; the mutation
method then receives the parsed output:

```ts
const saveUser = mutation('saveUser', {
  methodSchema: schema,
  method: (user) => user, // user.age is number
  loader: saveUserRequest,
});
```

`schemaExceptions()` returns typed `SCHEMA_VALIDATION_ERROR` exceptions. Each
exception contains the original Standard Schema issue and its path in
`payload.issues`.

## Built-in Validators

### cRequired

Checks that a value is present (not empty).

```ts
insertFormAttributes(() => ({
  validators: [cRequired()],
}));

// With condition
insertFormAttributes(() => ({
  validators: [cRequired({ when: () => fieldIsRequired() })],
}));
```

### cEmail

Checks that a string is a valid email.

```ts
insertFormAttributes(() => ({
  validators: [cEmail()],
}));
```

### cMin / cMax

Checks that a numeric value is within a range.

```ts
insertFormAttributes(() => ({
  validators: [cMin({ min: 18 }), cMax({ max: 100 })],
}));

// Dynamic values
insertFormAttributes(() => ({
  validators: [cMin({ min: () => minimumValue() })],
}));
```

### cMinLength / cMaxLength

Checks the length of a string or collection.

```ts
insertFormAttributes(() => ({
  validators: [cMinLength({ minLength: 8 }), cMaxLength({ maxLength: 500 })],
}));
```

### cPattern

Checks that a string matches a regex pattern.

```ts
insertFormAttributes(() => ({
  validators: [cPattern({ pattern: /^\d{10}$/ })],
}));
```

## Custom Validators

### cValidate

Creates a custom synchronous validator.

```ts
insertFormAttributes(() => ({
  validators: [
    cValidate({
      name: 'passwordStrength',
      validWhen: () => {
        const pwd = password();
        return pwd.length >= 8 && /[A-Z]/.test(pwd);
      },
      exception: () =>
        craftException(
          { _tag: 'weak-password' },
          {
            message:
              'Password must contain 8 characters and an uppercase letter',
          },
        ),
    }),
  ],
}));
```

### Group and cross-field validation

`insertFormAttributes` can target an object branch as well as a leaf field. Use
that branch when one rule depends on several values, such as password and
confirmation:

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

Calling `selectCredentials()` materializes the branch insertion. Returning the
selected group from component logic exposes the typed case
`credentials.passwordMismatch` to the component contract. It must then be
handled in the template or at a component boundary before the component can be
rendered, mounted, or loaded by a route.

The group does not need its own DOM control or `CraftFieldDirective`. Bind its
leaf fields normally and render the group message on an enclosing boundary.
See [Form exception handling](/guide/forms/exceptions#case-4-handle-a-group-or-cross-field-validator)
for both rendering options.

### cAsyncValidate

Creates an asynchronous validator based on a resource (query or mutation).

::: warning
It is not working yet. We are still working on it. The API is not final and may change.
:::

```ts
const { checkEmailQuery } = query('checkEmailQuery', {
  params: () => ({ email: emailInput() }),
  loader: async ({ params }) => {
    const response = await fetch(`/api/check-email?email=${params.email}`);
    return response.json();
  },
});

insertFormAttributes(() => ({
  validators: [
    cAsyncValidate(checkEmailQuery, {
      name: 'emailAvailability',
      exceptionsOnSuccess: ({ validateAsyncCraftResource }) => {
        if (!validateAsyncCraftResource.value()?.available) {
          return craftException({ _tag: 'email-taken' }, undefined);
        }
        return undefined;
      },
    }),
  ],
}));
```

## See Also

- [Forms overview](/guide/forms/)
- [Form exceptions](/guide/forms/exceptions)
