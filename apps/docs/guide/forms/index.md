# Forms

There is no `FormBuilder` here. **A form is derived from a state** — its field
tree, its validity and its error types are all consequences of that state and of
the mutation it submits to, so they cannot drift apart from them.

**Use it when** you collect input that needs validation and a typed submission.
**Not when** a single input maps to a single state — a plain
[`state`](/guide/state/local-state) with a `set` is enough.

::: tip Start with the guided version
[Learn step 8](/learn/08-forms) builds a small form end to end before you dig
into the individual insertions.
:::

## Why it is shaped this way

Three pillars, all of which follow from deriving rather than declaring:

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

const { userFormState } = state(
  'userFormState',
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
const { formState } = state(
  'formState',
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

## The pages

- **[Validation](/guide/forms/validation)** — built-in, custom and async validators
- **[Submitting](/guide/forms/submit)** — wiring a form to a mutation, typed submit exceptions
- **[Nested forms](/guide/forms/nested)** — sub-trees and sub-form fields
- **[Exception handling](/guide/forms/exceptions)** — reading and shaping form errors
- **[Complete examples](/guide/forms/examples)** — two forms end to end

## See Also

- [Validators](/guide/forms/validation)
- [Submitting](/guide/forms/submit)
- [Learn step 8](/learn/08-forms) — a form built end to end
