import styles from './text-editor.css' with { loader: 'text' };
import {
  button,
  craftComponent,
  div,
  heading,
  input,
  matchBlock,
  p,
  section,
  span,
} from '@craft-ts/component';
import {
  craftComputed,
  craftStateMachine,
  initStateMachine,
  on$,
  source$,
  state,
  transitionStep,
} from '@craft-ts/core';

type TextEditorStep = 'reading' | 'editing';

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
        const change$ = yield* source$<string>('text.change');
        const commit$ = yield* source$<void>('text.commit');
        const cancel$ = yield* source$<void>('text.cancel');

        const text = yield* state(
          'text',
          {
            committedValue: '',
            value: '',
          },
          ({ patch }) => ({
            change: on$(change$, (value) =>
              patch(() => ({
                value,
              })),
            ),
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
          }),
        );

        return { edit$, change$, commit$, cancel$, text };
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

      function* (context) {
        return {
          reading: { text: context.text },
          editing: { text: context.text },
        };
      },

      ({ context, currentStep }) => ({
        value: craftComputed('value', function* () {
          return (yield* context.text()).value;
        }),
        committedValue: craftComputed('committedValue', function* () {
          return (yield* context.text()).committedValue;
        }),
        stepState: craftComputed('stepState', function* () {
          // todo remove
          return {
            step: ((yield* currentStep()) ?? 'reading') as TextEditorStep,
          };
        }),
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
        edit: () => context.edit$.emit(),
        change: (value: string) => context.change$.emit(value),
        commit: () => context.commit$.emit(),
        cancel: () => context.cancel$.emit(),
      }),
    );

    return { machine };
  },
  ({ machine }) =>
    section([
      heading('State machine — declarative text editor'),
      p(
        { class: 'intro' },
        'The transitions only move between reading and editing. The text state reacts to change, commit, and cancel with declarative patch reactions.',
      ),

      div({ class: 'steps' }, [
        span({ class: machine.readingClass }, 'reading'),
        span({ class: machine.editingClass }, 'editing'),
      ]),

      matchBlock.exhaustive(
        machine.stepState as unknown as () => { step: TextEditorStep },
        'step',
        {
          reading: () =>
            div({ class: 'panel' }, [
              p(['Committed value: ', machine.committedValue]),
              p(['Current value: ', machine.value]),
              button(
                'text-edit',
                {
                  type: 'button',
                  click: function* () {
                    yield* machine.edit();
                  },
                },
                'Edit',
              ),
            ]),
          editing: () =>
            div({ class: 'panel' }, [
              labelText('Value'),
              input('text-input', {
                type: 'text',
                value: machine.value,
                input: function* (event) {
                  yield* machine.change(event.target.value);
                },
              }),
              div({ class: 'actions' }, [
                button(
                  'text-commit',
                  {
                    type: 'button',
                    click: function* () {
                      yield* machine.commit();
                    },
                  },
                  'Commit',
                ),
                button(
                  'text-cancel',
                  {
                    type: 'button',
                    class: 'secondary',
                    click: function* () {
                      yield* machine.cancel();
                    },
                  },
                  'Cancel',
                ),
              ]),
            ]),
        },
      ),
    ]),
);

function labelText(text: string) {
  return span({ class: 'field-label' }, text);
}

export default TextEditorStateMachine;
