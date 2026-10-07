import {
  craftComponent,
  div,
  fieldControl,
  input,
  label,
  p,
  type CraftNodeChild,
  type Input,
  type Output,
} from '@craft-ts/component';
import { fieldUi } from './field.style.ts';

export interface FieldInput {
  readonly label: Input<string>;
  /** Ties the label, the control and the hint together. Unique on the page. */
  readonly fieldId: Input<string>;
  readonly value: Input<string>;
  readonly placeholder: Input<string>;
  /** Help text under the control. Empty means none. */
  readonly hint: Input<string>;
  /** The value was refused: announced, and drawn in the danger tone. */
  readonly invalid: Input<boolean>;
  readonly disabled: Input<boolean>;
  /** Called with the new text on every keystroke. */
  readonly edit: Output<(value: string) => void>;
}

/**
 * A labelled text field. The label is a real `<label for>` and the hint is the
 * control's `aria-describedby`, so the field is announced with both. The value
 * is bound by reader, not read once: typing does not replace the control, so
 * focus and the caret stay where they are.
 */
export const DocField = craftComponent('DocField', {}, function* (
  props: FieldInput,
) {
  const text = yield* props.label();
  const id = yield* props.fieldId();
  const hint = yield* props.hint();
  const invalid = yield* props.invalid();
  const control = fieldControl(id, { invalid });

  const parts: CraftNodeChild[] = [
    label({ class: fieldUi.label, ...control.label }, text),
    input('docFieldInput', {
      class: fieldUi.input,
      id: control.input.id,
      type: 'text',
      value: props.value,
      placeholder: props.placeholder,
      disabled: function* () {
        return yield* props.disabled();
      },
      ...(hint ? { 'aria-describedby': control.input['aria-describedby'] } : {}),
      ...(invalid ? { 'aria-invalid': 'true' as const } : {}),
      input: (event) => props.edit(event.target.value),
    }),
  ];
  if (hint) {
    parts.push(p({ class: fieldUi.hint, ...control.description }, hint));
  }
  return div({ class: fieldUi.root }, parts);
});
