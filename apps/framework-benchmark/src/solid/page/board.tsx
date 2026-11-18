import { For, Match, Show, Switch } from 'solid-js';
import {
  BOARD_COLUMNS,
  NOTES,
  TABS,
  columnTasks,
  cx,
  fileIcon,
} from '../../page-common.js';
import { usePage } from './store.js';
import {
  Avatar,
  Badge,
  Button,
  Counter,
  Icon,
  IconButton,
  Tag,
  Timestamp,
} from './ui.js';

// -- Board ------------------------------------------------------------------

function TaskToggle(props: { task: any }) {
  const page = usePage();
  return (
    <label class="task-toggle">
      <input
        type="checkbox"
        checked={props.task.done}
        onChange={() =>
          page.dispatch({ type: 'toggle-task', id: props.task.id })
        }
      />
      <span>Done</span>
    </label>
  );
}

function Card(props: { task: any }) {
  const page = usePage();
  return (
    <article
      class={cx(
        'card',
        props.task.done && 'is-done',
        props.task.pinned && 'is-pinned',
        page.isDark() && 'is-dark',
      )}
      data-task={props.task.id}
    >
      <div class="card__head">
        <Avatar name={props.task.owner} size="sm" />
        <h5 class="card__title">{props.task.title}</h5>
      </div>
      <div class="card__tags">
        <For each={props.task.tags}>{(tag: string) => <Tag text={tag} />}</For>
      </div>
      <div class="card__counters">
        <Counter icon="heart" value={props.task.likes} />
        <Counter icon="chat" value={props.task.comments} />
      </div>
      <div class="card__meta">
        <Timestamp text={props.task.due} />
        <TaskToggle task={props.task} />
      </div>
      <div class="card__actions">
        <Button
          label="Like"
          variant="secondary"
          action={{ type: 'like-task', id: props.task.id }}
        />
        <Button
          label={props.task.pinned ? 'Unpin' : 'Pin'}
          variant="ghost"
          action={{ type: 'pin-task', id: props.task.id }}
        />
      </div>
    </article>
  );
}

function Board() {
  const page = usePage();
  return (
    <div class="board">
      <For each={BOARD_COLUMNS}>
        {(column) => {
          const tasks = () => columnTasks(page.tasksByColumn(), column.id as 'todo');
          return (
            <section class="board-column">
              <h4 class="board-column__title">
                {column.title}
                <span class="board-column__count">{String(tasks().length)}</span>
              </h4>
              <div class="board-column__cards">
                <For each={tasks()}>{(task) => <Card task={task} />}</For>
              </div>
            </section>
          );
        }}
      </For>
    </div>
  );
}

// -- Files ------------------------------------------------------------------

function FileRow(props: { file: any }) {
  const page = usePage();
  return (
    <li class={cx('file-row', page.isDark() && 'is-dark')}>
      <Icon name={fileIcon(props.file.kind)} />
      <span class="file-row__name">{props.file.name}</span>
      <span class="file-row__size">{props.file.size}</span>
      <Avatar name={props.file.owner} size="sm" />
      <Badge
        tone={props.file.shared ? 'info' : 'neutral'}
        text={props.file.shared ? 'Shared' : 'Private'}
      />
      <IconButton
        icon="download"
        label="Download"
        action="noop"
        active={false}
      />
    </li>
  );
}

function FilesTab() {
  const page = usePage();
  return (
    <div class="files">
      <ul class="file-list">
        <For each={page.model.files}>{(file) => <FileRow file={file} />}</For>
      </ul>
    </div>
  );
}

function NotesTab() {
  return (
    <div class="notes">
      <For each={NOTES}>{(note) => <p class="note">{note}</p>}</For>
    </div>
  );
}

// -- Tabs -------------------------------------------------------------------

function TabButton(props: { tab: { id: string; label: string } }) {
  const page = usePage();
  return (
    <button
      type="button"
      class={cx('tab', page.model.tab === props.tab.id && 'is-active')}
      role="tab"
      aria-selected={String(page.model.tab === props.tab.id) as 'true' | 'false'}
      onClick={() => page.dispatch({ type: 'set-tab', tab: props.tab.id })}
    >
      {props.tab.label}
    </button>
  );
}

export function TabsPanel() {
  const page = usePage();
  return (
    <section class="tabs">
      <div class="tabs__list" role="tablist">
        <For each={TABS}>{(tab) => <TabButton tab={tab} />}</For>
      </div>
      <div class="tabs__panel">
        <Show when={page.model.tab === 'board'}>
          <Board />
        </Show>
        <Show when={page.model.tab === 'files'}>
          <FilesTab />
        </Show>
        <Show when={page.model.tab === 'notes'}>
          <NotesTab />
        </Show>
      </div>
    </section>
  );
}
