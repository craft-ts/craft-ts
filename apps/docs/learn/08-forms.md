# 8. Build a form

**Goal:** a "new task" form with validation and a typed submit — derived from
state, not declared next to it.

## A form is a state

There is no `FormBuilder` here. You start from the state you already know, and
`insertForm` derives the form from it:

```typescript
import { state } from '@craft-ng/core';
import {
  cRequired,
  cMaxLength,
  insertForm,
  insertFormAttributes,
  insertNoopTypingAnchor,
  insertSelectFormTree,
} from '@craft-ng/core';

const taskForm = yield* state(
  'taskForm',
  { title: '', notes: '' },
  insertForm(
    insertSelectFormTree(
      'title',
      insertNoopTypingAnchor,
      insertFormAttributes(() => ({
        validators: [cRequired(), cMaxLength(80)],
      })),
    ),
    insertSelectFormTree(
      'notes',
      insertNoopTypingAnchor,
      insertFormAttributes(() => ({ validators: [] })),
    ),
  ),
);
```

Read it as: *the form is this shape, and here is what each field requires.* The
field tree, the validity, and the exception types are all derived from the state
type — you never restate them.

```typescript
const form = taskForm.form();
const title = form.selectTitle();

title()().exceptions.list; // typed list of this field's exceptions
title()().exceptions.byValidator['cRequired'];
```

::: warning `insertNoopTypingAnchor`
It adds no behaviour. It is a TypeScript anchor that the inference needs to type
the field and its exceptions. Every `insertSelectFormTree` needs one — it's a
known wart, not a step you can skip.
:::

## Validators

Built-ins cover the usual ground: `cRequired`, `cEmail`, `cMin` / `cMax`,
`cMinLength` / `cMaxLength`, `cPattern`. Custom ones use `cValidate`, and
`cAsyncValidate` for server-side checks. Details on
[Validation](/guide/forms/validation).

Attributes are derived too, so conditional UI is a function, not an effect:

```typescript
insertFormAttributes(() => ({
  validators: [cRequired()],
  disable: () => createTask.isLoading(),
  hidden: () => !showAdvanced(),
}));
```

## Submitting

Submission is wired to the mutation you wrote in step 6 — that is the whole
declaration:

```typescript
insertFormSubmit(createTask);
```

```typescript
form({ submit: () => taskForm.form().submit() }, [
  /* fields */
]);
```

The form now knows when it is submitting (`form().submitting()`), whether a
submit was attempted (`form().hasAttemptedSubmit()`), and — the point — **which
exceptions submission can produce**, inferred from the mutation:

```typescript
taskForm.form().submitExceptions();
```

If your mutation declares a `TITLE_ALREADY_EXISTS` exception, that code is in the
union. Rename it and the compiler tells you where you were handling it.

## Reshaping submit exceptions

Server codes are rarely what the UI wants to show. Refine them in an ordered
pipeline:

```typescript
insertFormSubmit(createTask, {
  exceptions: [
    ({ omit }) => omit(['TITLE_ALREADY_EXISTS']),
    ({ submitCraftResource }) => {
      const clash = submitCraftResource.exceptions()?.loader
        ?.TITLE_ALREADY_EXISTS;
      if (!clash) return undefined;
      return craftException({ code: 'PICK_ANOTHER_TITLE' }, clash.payload);
    },
  ],
});
```

Returning an array replaces the list; returning one exception appends it.

::: warning `success` is not a "then" callback
The config also accepts `success`, but it runs **inside the derivation of the
submit exception list** and its return value is appended to that list. It exists
to raise an exception the server reported with a 200 — not to run side effects.
Resetting the form, navigating or showing a toast from there means mutating
state inside a computation, and it re-runs whenever the exceptions recompute.
Drive those from your own code after `submit()`, or from the mutation.
:::

## What you gained

A form whose validity, field tree and error types are consequences of your state
and your mutation — so they cannot drift out of sync with them.

::: details Nested and parallel forms
Sub-forms with `insertSubFormField`, several independent forms over the same
state, and the full validator reference are on [Forms](/guide/forms/).
:::

<div style="display: flex; justify-content: space-between; margin-top: 2rem">

[← 7. Put state in the URL](/learn/07-url-state)

[9. Wire up routing →](/learn/09-routing)

</div>
