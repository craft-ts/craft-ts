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

## Choose the insertion

When a requirement mentions a form, start from `state` and add `insertForm`.
This map keeps the form tree, validation and mutation in one graph:

| Need                            | Recommended API                        |
| ------------------------------- | -------------------------------------- |
| Form derived from state         | `state` + `insertForm`                 |
| Nested field or object branch   | `insertSelectFormTree`                 |
| Field attributes and validation | `insertFormAttributes`                 |
| Whole-form validation           | `insertFormSchema`                     |
| Submit to a mutation            | `insertFormSubmit`                     |
| Field errors                    | `field.exceptions` or `fieldErrorNode` |
| Submission state                | `form().submitting()`                  |

`insertNoopTypingAnchor` is only a type-inference anchor for a selected field;
it adds no runtime behaviour. The common field shape is therefore:

```ts
insertSelectFormTree(
  'email',
  insertNoopTypingAnchor,
  insertFormAttributes(() => ({ validators: [cRequired(), cEmail()] })),
);
```

## Native controls, one binding rule

`CraftFieldDirective` supports text inputs, checkboxes, selects and textareas.
Keep a stable `id`/`htmlFor` pair and put the directive on the native control:

```ts
import { input, option, select, textarea } from '@craft-ts/component';

input('animal-name', { id: 'animal-name' }).pipe(
  CraftFieldDirective(animal.form.selectName()),
);

input('animal-available', { id: 'animal-available', type: 'checkbox' }).pipe(
  CraftFieldDirective(animal.form.selectAvailable()),
);

select('animal-species', { id: 'animal-species' }, [
  option('dog', { value: 'dog' }, 'Dog'),
  option('cat', { value: 'cat' }, 'Cat'),
]).pipe(CraftFieldDirective(animal.form.selectSpecies()));

textarea('animal-notes', { id: 'animal-notes' }).pipe(
  CraftFieldDirective(animal.form.selectNotes()),
);
```

A checkbox maps to a boolean, a select to its option value, and a textarea to
a string; nested fields use the corresponding selector chain.

## A complete form in one file

This is the shortest complete path: typed state, required/email validation, a
mutation, server exceptions, submitting state and errors rendered next to the
controls. The text in a real application should come from its i18n catalogue.

```ts
import {
  button,
  craftComponent,
  fieldErrorNode,
  form,
  input,
  label,
  p,
} from '@craft-ts/component';
import {
  cEmail,
  cRequired,
  CraftFieldDirective,
  craftException,
  insertForm,
  insertFormAttributes,
  insertFormSubmit,
  insertNoopTypingAnchor,
  insertSelectFormTree,
  mutation,
  state,
  type ValidatedFormValue,
} from '@craft-ts/core';

type Animal = { name: string; email: string };

const saveAnimal = mutation('saveAnimal', {
  method: (value: NonNullable<ValidatedFormValue<Animal>>) => value,
  loader: ({ params }) =>
    params.email.endsWith('@taken.test')
      ? craftException({ _tag: 'EMAIL_ALREADY_USED' }, { field: 'email' })
      : params,
});

export const AnimalForm = craftComponent(
  'AnimalForm',
  {},
  function* () {
    const animal = yield* state(
      'animalForm',
      { name: '', email: '' } satisfies Animal,
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
        insertFormSubmit(saveAnimal),
      ),
    );
    return { animal };
  },
  ({ animal }) =>
    form(
      'animal-form',
      {
        *submit(event) {
          event.preventDefault();
          yield* animal.form.submit();
        },
      },
      [
        label({ htmlFor: 'animal-name' }, 'Name'),
        input('animal-name', { id: 'animal-name' })
          .pipe(CraftFieldDirective(animal.form.selectName()))
          .pipe(
            fieldErrorNode.exhaustive({
              required: () => p('Name is required.'),
            }),
          ),
        label({ htmlFor: 'animal-email' }, 'Email'),
        input('animal-email', { id: 'animal-email', type: 'email' })
          .pipe(CraftFieldDirective(animal.form.selectEmail()))
          .pipe(
            fieldErrorNode.exhaustive({
              required: () => p('Email is required.'),
              email: () => p('Enter a valid email.'),
            }),
          ),
        button(
          'animal-submit',
          { type: 'submit', disabled: animal.form.submitting },
          'Save',
        ),
        p(function* () {
          if (!(yield* animal.form.hasSubmitExceptions())) return '';
          return 'The server rejected this animal.';
        }),
      ],
    ),
);
```

The advanced version uses the same primitives for nested `address` fields,
conditional visibility and asynchronous validation. Keep the branch insertion
in the feature rather than hiding it in a component library; see
[Nested forms](/guide/forms/nested) and
[Validation](/guide/forms/validation#casyncvalidate).

## Why it is shaped this way

Three pillars, all of which follow from deriving rather than declaring:

1. **Form Insertions** - Modular composition to tackle logic complexity
2. **Type-safe errors** - Synchronous and asynchronous validation with type-safe exceptions (inferred from validators and submit handler)
3. **Parallel Forms** - Support for multiple forms in the same state with automatic scoping

All of this is possible because the logic is entirely derived from the state.

## Form Insertions

Form insertions enable modular composition of functionality:

### insertForm

The primary insertion that derives a typed form from a primitive.

```ts
import { craftUse, state } from '@craft-ts/core';
import {
  insertForm,
  insertFormAttributes,
  insertNoopTypingAnchor,
  insertSelectFormTree,
  cRequired,
  cEmail,
} from '@craft-ts/core';

const userFormState = craftUse(
  state(
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
  ),
);

const form = userFormState.form;
const nameField = form.selectName();
const emailField = form.selectEmail();
```

> Note: It only works with the `state` primitive from now.

> `insertNoopTypingAnchor` is a special insertion that does not add any logic but allows to anchor the typing of the form field. It is required for the form system to infer the correct types of fields and exceptions. (TS limitations...)

### insertFormAttributes

Adds attributes and validators to a form field.

```ts
const formState = craftUse(
  state(
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
  ),
);

// Access email field and its exceptions
const form = formState.form;
const emailField = form.selectEmail();
const errors = emailField()().exceptions.list; // fully typed list of exceptions
const emailError = emailField()().exceptions.byValidator['cEmail'];
```

### Bind a field to the DOM

`CraftFieldDirective` is the DOM adapter for a `CraftField`. It binds the field
in both directions, marks it touched on blur, and reflects field state through
native attributes and `craft-*` CSS classes.

In a Craft template, apply the functional directive to the concrete node:

```ts
import { CraftFieldDirective } from '@craft-ts/core';

input({
  type: 'email',
}).pipe(CraftFieldDirective(loginForm.form.selectEmail()));
```

`insertSelectFormTree` materializes its branch lazily. When validators or other
insertions are attached through it, bind the field returned by `selectEmail()`
(or the corresponding `selectXxx()` method). Binding the raw
`loginForm.form.email` field bypasses that materialization, so those insertions
are not registered.

The directive supports text inputs and textareas, numeric and temporal inputs,
checkboxes, radio groups and selects. Validators also project native constraints
such as `required`, `min`, `max`, `minlength` and `maxlength`.

For a custom control, provide `CRAFT_FIELD_VALUE_CONTROL` or
`CRAFT_FIELD_CHECKBOX_CONTROL` on the component root. Native Craft nodes use the
functional directive directly.

### Render validation exceptions exhaustively

`fieldErrorNode.exhaustive` turns validation cases carried by
`CraftFieldDirective` or exposed by the component logic into compile-time UI
obligations. Every reachable code must have one handler, and an unreachable
handler is also rejected.

```ts
import { fieldErrorNode, input, p } from '@craft-ts/component';

input({ id: 'email', type: 'email' })
  .pipe(CraftFieldDirective(loginForm.form.selectEmail()))
  .pipe(
    fieldErrorNode.exhaustive({
      required: () => p('Email is required.'),
      email: () => p('Enter a valid email.'),
    }),
  );
```

The field stays mounted and invalid while a message is visible. The block adds
and merges `aria-invalid` and `aria-describedby`; it does not throw an
exception or feed route `handleExceptions`.

Use `fieldErrorNode.partial` when only some codes belong near the field.
Handled codes are removed from its contract and the remaining codes continue
to the next field-exception boundary:

```ts
input({ id: 'password', type: 'password' })
  .pipe(CraftFieldDirective(loginForm.form.selectPassword()))
  .pipe(
    fieldErrorNode.partial({
      required: () => p('Password is required.'),
    }),
  );
```

Here `password.required` is handled locally, while `password.minLength` must
still be handled by an enclosing `partial` or `exhaustive` block. A partial
block may omit reachable codes, but an unreachable handler remains a TypeScript
error.

At a component boundary, group handlers by static field path. Identical codes
on different fields remain separate obligations:

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

Object branches may also carry group or cross-field validators. Materialize the
branch in the component logic and return it from the factory:

```ts
const credentials = registration.form.selectCredentials();
return { registration, credentials };
```

Its cases, for example `credentials.passwordMismatch`, are part of the
component contract even when the group itself is not passed to
`CraftFieldDirective`. Handle the grouped path on an enclosing template VNode
or with `BaseComponent.pipe(fieldErrorNode.exhaustive(...))`. If it remains
unhandled, rendering, mounting, and `loadCraftComponent` reject the component
at compile time. See [Form exception handling](/guide/forms/exceptions) for the
complete group example.

By default the block reads the field's `visibleExceptions` directly. The form
owns that visibility policy; the default is touched or submitted:

```ts
insertFormAttributes(() => ({
  validators: [cRequired(), cEmail()],
  exceptionVisibility: { anyOf: ['touched', 'submitted'] },
}));
```

After a blur, only that field's visible exceptions are rendered. A submit
attempt reveals the remaining exceptions for every field. Available states are
`dirty`, `touched`, and `submitted`; a block can override
the inherited policy with `visibility: 'always'`, another `anyOf` combination,
or a predicate. `mode` is `first` (validator order) or `all`, and `position` is
`before` or `after`. Resetting the form clears dirty, touched, and submitted,
so inherited messages are hidden again.

Custom and async validators participate through their declared exception
union exactly like built-ins: their codes must be handled even when the current
visibility policy hides them.

### insertFormSchema

Adds a form-level `StandardSchemaV1` validator. Issues are projected onto the
matching fields by their schema path, while root and unmaterialized issues stay
available through `schemaExceptions()`.

```ts
const formState = craftUse(
  state(
    'formState',
    { email: '' },
    insertForm(insertFormSchema(userSchema), insertFormSubmit(saveUser)),
  ),
);
const form = formState.form;

form.email.errors();
form.hasSchemaExceptions();
form.schemaExceptions();
```

The form keeps the schema input value. Schema transformations belong at the
submit boundary, for example through the mutation's `methodSchema`.

### insertFormSubmit

`insertFormSubmit` connects the form to a mutation. It submits only validated
form values and exposes the mutation's loading and typed exception state on the
form.

See [Submitting a form](/guide/forms/submit) for the complete submission
workflow, including success handling and exception transformations.

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
