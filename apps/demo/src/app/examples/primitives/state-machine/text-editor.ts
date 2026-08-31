import styles from './text-editor.css' with { loader: 'text' };
import {
  button,
  craftComponent,
  div,
  heading,
  input,
  matchNode,
  p,
  section,
  span,
} from '@craft-ts/component';
import {
  craftComputed,
  craftStateMachine,
  initStateMachine,
  insertDeepYieldable,
  insertStatePipe,
  on$,
  source$,
  state,
  transitionStep,
} from '@craft-ts/core';

const TextEditorStateMachine = craftComponent(
  'TextEditorStateMachine',
  { stylesUrl: styles },
  function* () {
    const machine = yield* craftStateMachine(
      'textEditor',

      // The context reacts declaratively to sources. There are no state
      // mutations in the transition declarations below.
      function* () {
        const edit$ = yield* source$<void>('text.edit');
        const commit$ = yield* source$<void>('text.commit');
        const cancel$ = yield* source$<void>('text.cancel');

        const text = yield* state(
          'text',
          {
            committedValue: '',
            value: '',
          },
          insertStatePipe(insertDeepYieldable(), ({ patch }) => ({
            change: (value: string) =>
              patch(() => ({
                value,
              })),
            commit: on$(commit$, () =>
              patch((current) => ({
                committedValue: current.value,
              })),
            ),
            cancel: on$(cancel$, () =>
              patch((current) => ({
                value: current.committedValue,
              })),
            ),
          })),
        );

        return { edit$, commit$, cancel$, text };
      },

      // A transition only declares which source enters which step.
      function* (context, transit) {
        return {
          reading: transitionStep(function* () {
            yield* initStateMachine(() => transit());
            yield* on$(context.commit$, () => transit());
            yield* on$(context.cancel$, () => transit());
          }),
          editing: transitionStep(function* () {
            yield* on$(context.edit$, () => transit());
          }),
        };
      },

      function* ({ text, cancel$, commit$, edit$ }) {
        const { committedValue, value } = text;
        return {
          reading: {
            text: {
              committedValue,
              value,
            },
            edit$,
          },
          editing: { text, commit$, cancel$ },
        };
      },

      ({ currentStep }) => {
        return {
          readingClass: craftComputed('readingClass', function* () {
            return (yield* currentStep()) === 'reading'
              ? 'step step--active'
              : 'step';
          }),
          editingClass: craftComputed('editingClass', function* () {
            return (yield* currentStep()) === 'editing'
              ? 'step step--active'
              : 'step';
          }),
        };
      },
    );

    return { machine };
  },
  ({ machine: { currentStepWithContext, editingClass, readingClass } }) =>
    section([
      heading('State machine — declarative text editor'),
      p(
        { class: 'intro' },
        'The transitions only move between reading and editing. The text state reacts to change, commit, and cancel with declarative patch reactions.',
      ),

      div({ class: 'steps' }, [
        span({ class: readingClass }, 'reading'),
        span({ class: editingClass }, 'editing'),
      ]),

      matchNode.exhaustive(currentStepWithContext, 'step', {
        reading: (reading) =>
          div({ class: 'panel' }, [
            p(['Committed value: ', reading.text.committedValue]),
            p(['Current value: ', reading.text.value]),
            button(
              'text-edit',
              {
                type: 'button',
                click: () => reading.edit$.emit(),
              },
              'Edit',
            ),
          ]),
        editing: (editing) =>
          div({ class: 'panel' }, [
            labelText('Value'),
            input('text-input', {
              type: 'text',
              value: editing.text.value,
              input: function* (event) {
                yield* editing.text.change(event.target.value);
              },
            }),
            div({ class: 'actions' }, [
              button(
                'text-commit',
                {
                  type: 'button',
                  click: () => editing.commit$.emit(),
                },
                'Commit',
              ),
              button(
                'text-cancel',
                {
                  type: 'button',
                  class: 'secondary',
                  click: () => editing.cancel$.emit(),
                },
                'Cancel',
              ),
            ]),
          ]),
      }),
    ]),
);

function labelText(text: string) {
  return span({ class: 'field-label' }, text);
}

export default TextEditorStateMachine;
