# Nested forms

`insertSelectFormTree` targets a branch of the form, and `insertSubFormField`
declares a sub-form inside it — for state that is not flat.

**Use them when** the state has nested objects or arrays of objects.
**Not when** the form is one level deep — attach
[`insertFormAttributes`](/guide/forms/) directly.

## insertSelectFormTree

Selects and composes nested sub-forms.

```ts
interface ProductForm {
  name: string;
  variants: Array<{
    color: string;
    stock: number;
  }>;
}

const { productFormState } = state(
  'productFormState',
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

Selection is lazy: calling `selectVariant(...)`, `items()`, or an object
selector such as `selectEmail()` materializes the selected branch and registers
its insertions. Pass that selected field to DOM bindings; accessing the raw
field tree alone does not run the branch insertions.

## insertSubFormField

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

const { appointmentFormState } = state(
  'appointmentFormState',
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

## See Also

- [Forms overview](/guide/forms/)
- [Validation](/guide/forms/validation)
