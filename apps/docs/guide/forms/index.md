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
import { craftUse, state } from '@craft-ng/core';
import {
  insertForm,
  insertFormAttributes,
  insertNoopTypingAnchor,
  insertSelectFormTree,
  cRequired,
  cEmail,
} from '@craft-ng/core';

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
import { CraftFieldDirective } from '@craft-ng/core';

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

Angular templates can keep using the deprecated compatibility wrapper during
the migration:

```ts
import { LegacyCraftFieldDirective } from '@craft-ng/core';

@Component({
  imports: [LegacyCraftFieldDirective],
  template: ` <input type="email" [craftField]="emailField" /> `,
})
export class LoginComponent {
  protected readonly emailField = this.loginForm.form.selectEmail();
}
```

For a custom Angular control, provide `CRAFT_FIELD_VALUE_CONTROL` or
`CRAFT_FIELD_CHECKBOX_CONTROL` on the host component and use the compatibility
wrapper. Native Craft nodes use the functional directive directly.

### Render validation exceptions exhaustively

`fieldExceptionBlock.exhaustive` turns the validators carried by
`CraftFieldDirective` into a compile-time UI obligation. Every reachable code
must have one handler, and an unreachable handler is also rejected.

```ts
import { fieldExceptionBlock, input, p } from '@craft-ng/component';

input({ id: 'email', type: 'email' })
  .pipe(CraftFieldDirective(loginForm.form.selectEmail()))
  .pipe(
    fieldExceptionBlock.exhaustive({
      required: () => p('Email is required.'),
      email: () => p('Enter a valid email.'),
    }),
  );
```

The field stays mounted and invalid while a message is visible. The block adds
and merges `aria-invalid` and `aria-describedby`; it does not throw an
exception or feed route `handleExceptions`.

Use `fieldExceptionBlock.partial` when only some codes belong near the field.
Handled codes are removed from its contract and the remaining codes continue
to the next field-exception boundary:

```ts
input({ id: 'password', type: 'password' })
  .pipe(CraftFieldDirective(loginForm.form.selectPassword()))
  .pipe(
    fieldExceptionBlock.partial({
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
  fieldExceptionBlock.exhaustive({
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

By default the block reads the field's `visibleExceptions` directly. The form
owns that visibility policy; the default remains dirty or submitted:

```ts
insertFormAttributes(() => ({
  validators: [cRequired(), cEmail()],
  exceptionVisibility: { anyOf: ['touched', 'submitted'] },
}));
```

Available states are `dirty`, `touched`, and `submitted`. A block can override
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
