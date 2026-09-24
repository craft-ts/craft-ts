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
import { example } from '../../shared/example.style';
import { editor } from './editor.style';

const TextEditorStateMachine = craftComponent(
  'TextEditorStateMachine',
  {},
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
          readingStep: craftComputed('readingStep', function* () {
            return (yield* currentStep()) === 'reading' ? 'active' : null;
          }),
          editingStep: craftComputed('editingStep', function* () {
            return (yield* currentStep()) === 'editing' ? 'active' : null;
          }),
        };
      },
    );

    return { machine };
  },
  ({ machine: { currentStepWithContext, editingStep, readingStep } }) =>
    section({ class: example.card }, [
      heading(
        { class: example.title },
        'State machine — declarative text editor',
      ),
      p(
        { class: example.text, 'data-exampleText': 'muted' },
        'The transitions only move between reading and editing. The text state reacts to change, commit, and cancel with declarative patch reactions.',
      ),

      div({ class: editor.steps }, [
        span({ class: editor.step, 'data-editorStep': readingStep }, 'reading'),
        span({ class: editor.step, 'data-editorStep': editingStep }, 'editing'),
      ]),

      matchNode.exhaustive(currentStepWithContext, 'step', {
        reading: (reading) =>
          div({ class: editor.panel }, [
            p(['Committed value: ', reading.text.committedValue]),
            p(['Current value: ', reading.text.value]),
            button(
              'text-edit',
              {
                class: example.button,
                'data-exampleButton': 'primary',
                type: 'button',
                click: () => reading.edit$.emit(),
              },
              'Edit',
            ),
          ]),
        editing: (editing) =>
          div({ class: editor.panel }, [
            labelText('Value'),
            input('text-input', {
              class: example.input,
              'data-exampleField': 'wide',
              type: 'text',
              value: editing.text.value,
              input: function* (event) {
                yield* editing.text.change(event.target.value);
              },
            }),
            div({ class: example.row }, [
              button(
                'text-commit',
                {
                  class: example.button,
                  'data-exampleButton': 'primary',
                  type: 'button',
                  click: () => editing.commit$.emit(),
                },
                'Commit',
              ),
              button(
                'text-cancel',
                {
                  type: 'button',
                  class: example.button,
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
  return span({ class: editor.label }, text);
}

export default TextEditorStateMachine;
