import {
  article,
  button,
  craftComponent,
  div,
  forNode,
  h4,
  h5,
  ifNode,
  input,
  label,
  li,
  p,
  section,
  span,
  ul,
  type Input,
} from '@craft-ts/component';
import {
  BOARD_COLUMNS,
  NOTES,
  TABS,
  columnTasks,
  cx,
  fileIcon,
  type FileEntry,
  type Task,
} from '../page-common.js';
import { Page } from './store.js';
import {
  Avatar,
  Badge,
  Button,
  Counter,
  Icon,
  IconButton,
  Tag,
  Timestamp,
  derive,
  fixed,
  pluck,
} from './ui.js';

// -- Board ------------------------------------------------------------------

type TaskInputs = { readonly task: Input<Task> };

const TaskToggle = craftComponent('TaskToggle', {}, (inputs: TaskInputs) =>
  label({ class: 'task-toggle' }, [
    input('taskToggle', {
      type: 'checkbox',
      checked: pluck(inputs.task, 'done'),
      *change() {
        yield* Page.model.dispatch({
          type: 'toggle-task',
          id: (yield* inputs.task()).id,
        });
      },
    }),
    span('Done'),
  ]),
);

const Card = craftComponent('Card', {}, (inputs: TaskInputs) =>
  article(
    {
      class: function* () {
        return cx(
          'card',
          (yield* inputs.task()).done && 'is-done',
          (yield* inputs.task()).pinned && 'is-pinned',
          (yield* Page.isDark()) && 'is-dark',
        );
      },
      'data-task': pluck(inputs.task, 'id'),
    },
    [
      div({ class: 'card__head' }, [
        Avatar({ name: pluck(inputs.task, 'owner'), size: fixed('sm') }),
        h5({ class: 'card__title' }, pluck(inputs.task, 'title')),
      ]),
      div(
        { class: 'card__tags' },
        forNode(
          pluck(inputs.task, 'tags'),
          { track: (_tag, index) => index },
          (tag) => Tag({ text: tag }),
        ),
      ),
      div({ class: 'card__counters' }, [
        Counter({ icon: fixed('heart'), value: pluck(inputs.task, 'likes') }),
        Counter({ icon: fixed('chat'), value: pluck(inputs.task, 'comments') }),
      ]),
      div({ class: 'card__meta' }, [
        Timestamp({ text: pluck(inputs.task, 'due') }),
        TaskToggle({ task: inputs.task }),
      ]),
      div({ class: 'card__actions' }, [
        Button({
          label: fixed('Like'),
          variant: fixed('secondary'),
          action: derive(inputs.task, (task) => ({
            type: 'like-task',
            id: task.id,
          })),
        }),
        Button({
          label: derive(inputs.task, (task) => (task.pinned ? 'Unpin' : 'Pin')),
          variant: fixed('ghost'),
          action: derive(inputs.task, (task) => ({
            type: 'pin-task',
            id: task.id,
          })),
        }),
      ]),
    ],
  ),
);

type BoardColumn = { readonly id: 'todo' | 'doing' | 'review' | 'done'; readonly title: string };

const Board = craftComponent('Board', {}, () =>
  div(
    { class: 'board' },
    forNode(BOARD_COLUMNS as readonly BoardColumn[], { track: (column) => column.id }, (column) => {
      const id = pluck(column, 'id');
      const tasks = function* () {
        return columnTasks(yield* Page.tasksByColumn(), yield* id());
      };
      return section({ class: 'board-column' }, [
        h4({ class: 'board-column__title' }, [
          pluck(column, 'title'),
          span({ class: 'board-column__count' }, function* () {
            return String((yield* tasks()).length);
          }),
        ]),
        div(
          { class: 'board-column__cards' },
          forNode(tasks, { track: (task) => task.id }, (task) =>
            Card({ task }),
          ),
        ),
      ]);
    }),
  ),
);

// -- Files ------------------------------------------------------------------

const FileRow = craftComponent(
  'FileRow',
  {},
  (inputs: { readonly file: Input<FileEntry> }) =>
    li(
      {
        class: function* () {
          return cx('file-row', (yield* Page.isDark()) && 'is-dark');
        },
      },
      [
        Icon({ name: derive(inputs.file, (file) => fileIcon(file.kind)) }),
        span({ class: 'file-row__name' }, pluck(inputs.file, 'name')),
        span({ class: 'file-row__size' }, pluck(inputs.file, 'size')),
        Avatar({ name: pluck(inputs.file, 'owner'), size: fixed('sm') }),
        Badge({
          tone: derive(inputs.file, (file) => (file.shared ? 'info' : 'neutral')),
          text: derive(inputs.file, (file) => (file.shared ? 'Shared' : 'Private')),
        }),
        IconButton({
          icon: fixed('download'),
          label: fixed('Download'),
          action: fixed('noop'),
          active: fixed(false),
        }),
      ],
    ),
);

const FilesTab = craftComponent('FilesTab', {}, () =>
  div(
    { class: 'files' },
    ul(
      { class: 'file-list' },
      forNode(Page.files, { track: (file) => file.id }, (file) =>
        FileRow({ file }),
      ),
    ),
  ),
);

const NotesTab = craftComponent('NotesTab', {}, () =>
  div(
    { class: 'notes' },
    forNode(NOTES, { track: (_note, index) => index }, (note) =>
      p({ class: 'note' }, note),
    ),
  ),
);

// -- Tabs -------------------------------------------------------------------

const TabButton = craftComponent(
  'TabButton',
  {},
  (inputs: { readonly tab: Input<{ readonly id: string; readonly label: string }> }) =>
    button(
      'tab',
      {
        type: 'button',
        class: function* () {
          return cx(
            'tab',
            (yield* Page.tab()) === (yield* inputs.tab()).id && 'is-active',
          );
        },
        role: 'tab',
        'aria-selected': function* () {
          return String((yield* Page.tab()) === (yield* inputs.tab()).id);
        },
        *click() {
          yield* Page.model.dispatch({
            type: 'set-tab',
            tab: (yield* inputs.tab()).id,
          });
        },
      },
      pluck(inputs.tab, 'label'),
    ),
);

export const TabsPanel = craftComponent('TabsPanel', {}, () =>
  section({ class: 'tabs' }, [
    div(
      { class: 'tabs__list', role: 'tablist' },
      forNode(TABS, { track: (tab) => tab.id }, (tab) => TabButton({ tab })),
    ),
    div({ class: 'tabs__panel' }, [
      ifNode(Page.onBoard, () => Board({})),
      ifNode(Page.onFiles, () => FilesTab({})),
      ifNode(Page.onNotes, () => NotesTab({})),
    ]),
  ]),
);
