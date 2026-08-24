/* eslint-disable craft-ts/no-hardcoded-design-values -- Demo UI colours are intentionally local to this example. */
import styles from './task-board.css' with { loader: 'text' };
import {
  button,
  craftComponent,
  div,
  each,
  heading,
  input,
  li,
  p,
  section,
  span,
  ul,
  type Input,
} from '@craft-ts/component';
import {
  craftComputed,
  craftStateMachine,
  initStateMachine,
  on$,
  source$,
  state,
  transitionStep,
  withBackNavigation,
  withStateMachineHistory,
} from '@craft-ts/core';

type Task = {
  readonly id: string;
  readonly title: string;
};

const TASKS: readonly Task[] = [
  { id: 'craft-2941', title: 'Type the transitions record' },
  { id: 'craft-3007', title: 'Anchor the history on the entity' },
  { id: 'craft-3102', title: 'Stop numbering singletons' },
];

/**
 * One row, one machine, one history.
 *
 * Every row builds the same code, so the machines are indistinguishable by
 * name — they are told apart by their host chain, which carries the ordinal of
 * the component instance that holds them. That is what keeps each row's
 * snapshot capturing its own primitives and nobody else's.
 */
const TaskRow = craftComponent(
  'TaskRow',
  { stylesUrl: styles },
  function* (task: Input<Task>) {
    const { id, title } = yield* task();
    const machine = yield* craftStateMachine(
      'taskRow',

      function* () {
        const note = yield* state('note', '', ({ set }) => ({
          to: (value: string) => set(value),
        }));
        const start$ = yield* source$<void>('start$');
        const finish$ = yield* source$<void>('finish$');
        const reopen$ = yield* source$<void>('reopen$');

        return { note, start$, finish$, reopen$ };
      },

      function* (context, transit) {
        return {
          todo: transitionStep(function* () {
            yield* initStateMachine(() => transit());
            yield* on$(context.reopen$, () => transit());
          }),
          doing: transitionStep(function* () {
            yield* on$(context.start$, () => transit());
          }),
          done: transitionStep(function* () {
            yield* on$(context.finish$, () => transit());
          }),
        };
      },

      function* (context) {
        return {
          todo: { note: context.note },
          doing: { note: context.note },
          done: { note: context.note },
        };
      },

      // The anchor comes from the DATA, not from the order the row happened to
      // be created in: reload the page, reorder the list, the history of
      // `craft-3007` is still the history of `craft-3007`.
      function* (machineContext) {
        const history = yield* withStateMachineHistory(
          {
            persist: { storeName: 'demo', key: () => `task-${id}` },
          },
          withBackNavigation(),
        )(machineContext);

        return {
          ...history,
          note: machineContext.context.note,
          setNote: function* (value: string) {
            yield* machineContext.context.note.to(value);
          },
          step: craftComputed('step', function* () {
            return (yield* machineContext.currentStep()) ?? 'todo';
          }),
          isTodo: craftComputed('isTodo', function* () {
            return (yield* machineContext.currentStep()) === 'todo';
          }),
          isDoing: craftComputed('isDoing', function* () {
            return (yield* machineContext.currentStep()) === 'doing';
          }),
          isDone: craftComputed('isDone', function* () {
            return (yield* machineContext.currentStep()) === 'done';
          }),
          startDisabled: craftComputed('startDisabled', function* () {
            return (yield* machineContext.currentStep()) !== 'todo';
          }),
          finishDisabled: craftComputed('finishDisabled', function* () {
            return (yield* machineContext.currentStep()) !== 'doing';
          }),
          reopenDisabled: craftComputed('reopenDisabled', function* () {
            return (yield* machineContext.currentStep()) === 'todo';
          }),
          historyLabel: craftComputed('historyLabel', function* () {
            const entries = yield* history.history();
            const cursor = yield* history.historyCursor();
            return `${title} · moment ${cursor + 1}/${entries.length}`;
          }),
          backDisabled: craftComputed('backDisabled', function* () {
            return !(yield* history.canGoBack());
          }),
          forwardDisabled: craftComputed('forwardDisabled', function* () {
            return !(yield* history.canGoForward());
          }),
          start: () => machineContext.context.start$.emit(),
          finish: () => machineContext.context.finish$.emit(),
          reopen: () => machineContext.context.reopen$.emit(),
        };
      },
    );

    return { machine, title, id };
  },
  ({ machine, title }) =>
    li({ class: 'row' }, [
      div({ class: 'row__head' }, [
        span({ class: 'row__title' }, title),
        span({ class: 'badge' }, machine.step),
      ]),

      input('task-note', {
        type: 'text',
        class: 'row__note',
        placeholder: 'Note recorded with each move…',
        value: machine.note,
        *input(event) {
          yield* machine.setNote((event.target as HTMLInputElement).value);
        },
      }),

      div({ class: 'row__actions' }, [
        button(
          'task-start',
          {
            type: 'button',
            disabled: machine.startDisabled,
            click: function* () {
              yield* machine.start();
            },
          },
          'Start',
        ),
        button(
          'task-finish',
          {
            type: 'button',
            disabled: machine.finishDisabled,
            click: function* () {
              yield* machine.finish();
            },
          },
          'Finish',
        ),
        button(
          'task-reopen',
          {
            type: 'button',
            class: 'secondary',
            disabled: machine.reopenDisabled,
            click: function* () {
              yield* machine.reopen();
            },
          },
          'Reopen',
        ),
      ]),

      div({ class: 'row__actions' }, [
        button(
          'task-back',
          {
            type: 'button',
            class: 'secondary',
            disabled: machine.backDisabled,
            click: function* () {
              yield* machine.back();
            },
          },
          '← Back',
        ),
        button(
          'task-forward',
          {
            type: 'button',
            class: 'secondary',
            disabled: machine.forwardDisabled,
            click: function* () {
              yield* machine.forward();
            },
          },
          'Forward →',
        ),
        span({ class: 'row__history' }, machine.historyLabel),
      ]),
    ]),
);

const TaskBoardStateMachineList = craftComponent(
  'TaskBoardStateMachineList',
  { stylesUrl: styles },
  function* () {
    return {};
  },
  () =>
    section([
      heading('State machine — one per row'),
      p(
        { class: 'intro' },
        'Three rows, three machines, three histories. Rewinding one row leaves the others alone, and each history is anchored on the task id — so it survives a reload and a reorder.',
      ),
      ul(
        { class: 'rows' },
        each(TASKS, { track: (task) => task.id }, (task) =>
          TaskRow({
            task: task,
          }),
        ),
      ),
    ]),
);

export default TaskBoardStateMachineList;
