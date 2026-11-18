import {
  craftComponent,
  div,
  fieldset,
  form,
  forNode,
  h3,
  ifNode,
  input,
  label,
  legend,
  matchNode,
  option,
  p,
  select,
  textarea,
  type Input,
} from '@craft-ts/component';
import {
  FORM_GROUPS,
  cx,
  fieldLabel,
  isMissing,
  type FieldDef,
} from '../page-common.js';
import { Page } from './store.js';
import { Button, derive, fixed, pluck } from './ui.js';

type FieldInputs = { readonly field: Input<FieldDef> };

const Label = craftComponent('Label', {}, (inputs: FieldInputs) =>
  label({ class: 'form-field__label' }, derive(inputs.field, fieldLabel)),
);

const HelpText = craftComponent('HelpText', {}, (inputs: FieldInputs) =>
  p({ class: 'help' }, pluck(inputs.field, 'help')),
);

const FieldError = craftComponent('FieldError', {}, () =>
  p({ class: 'field-error' }, 'This field is required.'),
);

const text = function* (field: Input<FieldDef>) {
  return String((yield* Page.form())[(yield* field()).id]);
};
const checked = function* (field: Input<FieldDef>) {
  return (yield* Page.form())[(yield* field()).id] === true;
};

const FormControl = craftComponent('FormControl', {}, (inputs: FieldInputs) =>
  matchNode.exhaustive(inputs.field, 'kind', {
    text: () =>
      input('fieldText', {
        type: 'text',
        class: 'control',
        value: () => text(inputs.field),
        *input(event) {
          yield* Page.model.dispatch({
            type: 'edit-field',
            id: (yield* inputs.field()).id,
            value: event.target.value,
          });
        },
      }),
    textarea: () =>
      textarea('fieldTextarea', {
        class: 'control control--area',
        value: () => text(inputs.field),
        *input(event) {
          yield* Page.model.dispatch({
            type: 'edit-field',
            id: (yield* inputs.field()).id,
            value: event.target.value,
          });
        },
      }),
    select: () =>
      select(
        'fieldSelect',
        {
          class: 'control',
          *change(event) {
            yield* Page.model.dispatch({
              type: 'edit-field',
              id: (yield* inputs.field()).id,
              value: event.target.value,
            });
          },
        },
        forNode(
          function* () {
            return (yield* inputs.field()).options ?? [];
          },
          { track: (name) => name },
          (name) =>
            option(
              {
                value: name,
                selected: function* () {
                  return (yield* text(inputs.field)) === (yield* name());
                },
              },
              name,
            ),
        ),
      ),
    checkbox: () =>
      input('fieldCheck', {
        type: 'checkbox',
        class: 'control control--check',
        checked: () => checked(inputs.field),
        *change(event) {
          yield* Page.model.dispatch({
            type: 'edit-field',
            id: (yield* inputs.field()).id,
            value: event.target.checked,
          });
        },
      }),
  }),
);

const FormField = craftComponent('FormField', {}, (inputs: FieldInputs) =>
  div(
    {
      class: function* () {
        const field = yield* inputs.field();
        return cx(
          'form-field',
          isMissing(field, (yield* Page.form())[field.id]) && 'has-error',
        );
      },
    },
    [
      Label({ field: inputs.field }),
      FormControl({ field: inputs.field }),
      HelpText({ field: inputs.field }),
      ifNode(
        'missing',
        function* () {
          const field = yield* inputs.field();
          return isMissing(field, (yield* Page.form())[field.id]);
        },
        () => FieldError({}),
      ),
    ],
  ),
);

type Group = {
  readonly id: string;
  readonly title: string;
  readonly fields: readonly FieldDef[];
};

const FormGroup = craftComponent(
  'FormGroup',
  {},
  (inputs: { readonly group: Input<Group> }) =>
    fieldset({ class: 'form-group' }, [
      legend({ class: 'form-group__title' }, pluck(inputs.group, 'title')),
      forNode(
        pluck(inputs.group, 'fields'),
        { track: (field) => field.id },
        (field) => FormField({ field }),
      ),
    ]),
);

export const FormSection = craftComponent('FormSection', {}, () =>
  form({ class: 'form-section' }, [
    h3({ class: 'form-section__title' }, 'Account details'),
    forNode(FORM_GROUPS, { track: (group) => group.id }, (group) =>
      FormGroup({ group }),
    ),
    div({ class: 'form-section__actions' }, [
      Button({
        label: fixed('Save'),
        variant: fixed('primary'),
        action: fixed('noop'),
      }),
      Button({
        label: fixed('Cancel'),
        variant: fixed('ghost'),
        action: fixed('noop'),
      }),
    ]),
  ]),
);
