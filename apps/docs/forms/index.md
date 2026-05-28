# Forms with @craft-ng

@craft-ng provides a complete form management system, enabling the creation of reactive, type-safe, and composable forms with @craft-ng primitives.
Unlike most form libraries, a form is derived from state, and all form logic and validators are also derived for a fully declarative form.

## Overview

The main benefits of the @craft-ng form system are built on three pillars:

1. **Form Insertions** - Modular composition to tackle logic complexity
2. **Type-safe errors** - Synchronous and asynchronous validation with type-safe exceptions (inferred from validators and submit handler)
3. **Parallel Forms** - Support for multiple forms in the same state with automatic scoping

All of this is possible because the logic is entirely derived from the state.

## Form Insertions

Form insertions enable modular composition of functionality:

### insertForm

The primary insertion that creates an Angular Signal-Form from a primitive.

```ts
import { state } from '@craft-ng/core';
import {
  insertForm,
  insertFormAttributes,
  insertNoopTypingAnchor,
  insertSelectFormTree,
  cRequired,
  cEmail,
} from '@craft-ng/core';

const userFormState = state(
  { name: '', email: '' },
  insertForm(
    insertSelectFormTree(
      'name',
      insertNoopTypingAnchor, // TS limitation
      insertFormAttributes(() => ({
        validators: [cRequired()],
      })),
    ),
    insertSelectFormTree(
      'email',
      insertNoopTypingAnchor, // TS limitation
      insertFormAttributes(() => ({
        validators: [cRequired(), cEmail()],
      })),
    ),
  ),
);

const form = userFormState.form();
const nameField = form.selectName();
const emailField = form.selectEmail();
```

> Note: It only works with the `state` primitive from now.

> `insertNoopTypingAnchor` is a special insertion that does not add any logic but allows to anchor the typing of the form field. It is required for the form system to infer the correct types of fields and exceptions. (TS limitations...)

### insertFormAttributes

Adds attributes and validators to a form field.

```ts
const formState = state(
  { email: '' },
  insertForm(
    insertSelectFormTree(
      'email',
      insertNoopTypingAnchor,
      insertFormAttributes(() => ({
        validators: [cRequired(), cEmail()],
        disable: () => isLoading(),
        hidden: () => !showField(),
      })),
    ),
  ),
);

// Access email field and its exceptions
const form = formState.form();
const emailField = form.selectEmail();
const errors = emailField()().exceptions.list; // fully typed list of exceptions
const emailError = emailField()().exceptions.byValidator['cEmail'];
```

### insertFormSubmit

Connects form submission to a mutation.

```ts
const updateUserMutation = mutation({
  method: (data: ValidatedFormValue<UserForm>) => data,
  loader: function* ({ params: user }) {
    return yield* CraftHttpClient.patch(({ response }) => ({
      url: '/api/users',
      body: user,
      success: response<User>(),
    }));
  },
});

const userFormState = state(
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
    }),
  ),
);

// Submit the form
userFormState.form().submit(); // Automatically triggers the mutation
```

### insertSelectFormTree

Selects and composes nested sub-forms.

```ts
interface ProductForm {
  name: string;
  variants: Array<{
    color: string;
    stock: number;
  }>;
}

const productFormState = state(
  { name: '', variants: [] } as ProductForm,
  insertForm(
    insertSelectFormTree(
      'variant',
      insertNoopTypingAnchor,
      insertFormAttributes(() => ({
        validators: [cRequired(), cMin({ min: 0 })],
      })),
    ),
  ),
);

// Access sub-forms
const form = productFormState.form();
const variant0 = form.selectVariant(0);
const allVariants = form.items();
```

### insertSubFormField

Exposes a derived sub-form from a parent value through a lens. This is useful when the form field is not stored as a nested object in the state, but can still be read and written from the parent value.

```ts
import { state } from '@craft-ng/core';
import {
  insertForm,
  insertFormAttributes,
  insertSubFormField,
  splitLens,
  cRequired,
} from '@craft-ng/core';

const appointmentFormState = state(
  '2026-05-10 12:00',
  insertForm(
    insertSubFormField(
      'date',
      splitLens(' ', 0),
      insertFormAttributes(() => ({
        validators: [cRequired()],
      })),
    ),
    insertSubFormField('time', splitLens(' ', 1)),
  ),
);

const form = appointmentFormState.form();
const dateField = form.selectDate();
const timeField = form.selectTime();

console.log(dateField.value()); // '2026-05-10'
console.log(timeField.value()); // '12:00'

dateField.set('2026-05-11');
timeField.set('09:30');

console.log(appointmentFormState()); // '2026-05-11 09:30'
```

## Validators

@craft-ng provides a complete set of validators with structured exception handling:

### Built-in Validators

#### cRequired

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

#### cEmail

Checks that a string is a valid email.

```ts
insertFormAttributes(() => ({
  validators: [cEmail()],
}));
```

#### cMin / cMax

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

#### cMinLength / cMaxLength

Checks the length of a string or collection.

```ts
insertFormAttributes(() => ({
  validators: [cMinLength({ minLength: 8 }), cMaxLength({ maxLength: 500 })],
}));
```

#### cPattern

Checks that a string matches a regex pattern.

```ts
insertFormAttributes(() => ({
  validators: [cPattern({ pattern: /^\d{10}$/ })],
}));
```

### Custom Validators

#### cValidate

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
          { code: 'weak-password' },
          {
            message:
              'Password must contain 8 characters and an uppercase letter',
          },
        ),
    }),
  ],
}));
```

#### cAsyncValidate

Creates an asynchronous validator based on a resource (query or mutation).

```warn
It is not working yet, we are still working on it. The API is not final and may change.
```

```ts
const checkEmailQuery = query({
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
          return craftException({ code: 'email-taken' }, undefined);
        }
        return undefined;
      },
    }),
  ],
}));
```

## Exception Handling

@craft-ng forms use a structured exception system:

```ts
const form = userFormState.form();

// All exceptions
const allErrors = form.exceptions().list;

// get first or last validation exception according to the order of validators
const first = fieldForm.form.firstLeftFailedValidation();
const last = fieldForm.form.lastRightFailedValidation();

// Exception by validator
const requiredError = form().selectEmail()().exceptions()?.byValidator[
  'cRequired'
];
const emailError = form().selectEmail()().exceptions()?.byValidator.cEmail;

// Each exception has a code and payload
if (emailError) {
  console.log(emailError.code); // 'email'
  console.log(emailError.payload); // undefined
}

if (form.exceptions()?.byValidator?.cMin) {
  const minError = form.exceptions()?.byValidator?.['cMin'];
  console.log(minError.code); // 'min'
  console.log(minError.payload); // 18 (the minimum value)
}
```

## Complete Examples

### Creation Form with Validation

```ts
interface User {
  name: string;
  email: string;
  age: number;
}

const createUserMutation = mutation({
  method: (data: ValidatedFormValue<User>) => data,
  loader: function* ({ params: user }) {
    return yield* CraftHttpClient.update(({ response }) => ({
      url: '/api/users',
      body: user,
      success: response<User>(),
    }));
  },
});

const userFormState = state(
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

### Complex Nested Form

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

const userFormState = state(
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
