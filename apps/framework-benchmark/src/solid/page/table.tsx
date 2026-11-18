import { For, Show } from 'solid-js';
import {
  SORT_COLUMNS,
  STATUS_FILTERS,
  bucket,
  cx,
  roleTone,
  statusLabel,
} from '../../page-common.js';
import { usePage } from './store.js';
import { Avatar, Badge, Button, Icon, IconButton, Tag } from './ui.js';

// -- Toolbar ----------------------------------------------------------------

function FilterChip(props: { filter: { id: string; label: string } }) {
  const page = usePage();
  return (
    <button
      type="button"
      class={cx('chip', page.model.status === props.filter.id && 'is-active')}
      onClick={() =>
        page.dispatch({ type: 'set-status', status: props.filter.id })
      }
    >
      {props.filter.label}
      <span class="chip__count">
        {String(page.statusCounts()[props.filter.id as 'all'])}
      </span>
    </button>
  );
}

export function Toolbar() {
  return (
    <div class="toolbar">
      <div class="toolbar__group">
        <For each={STATUS_FILTERS}>{(filter) => <FilterChip filter={filter} />}</For>
      </div>
      <div class="toolbar__group">
        <Button
          label="Reset"
          variant="secondary"
          action={{ type: 'set-status', status: 'all' }}
        />
        <Button label="Density" variant="ghost" action="density" />
      </div>
    </div>
  );
}

// -- Table ------------------------------------------------------------------

function SortHeader(props: { column: { id: string; label: string } }) {
  const page = usePage();
  const sorted = () => page.model.sortKey === props.column.id;
  return (
    <th
      class={cx('sort-header', sorted() && 'is-sorted')}
      aria-sort={
        !sorted() ? 'none' : page.model.sortDir === 'asc' ? 'ascending' : 'descending'
      }
    >
      <button
        type="button"
        class="sort-header__btn"
        onClick={() =>
          page.dispatch({ type: 'set-sort', key: props.column.id })
        }
      >
        {props.column.label}
        <Show when={sorted()}>
          <Icon name={page.model.sortDir === 'asc' ? 'up' : 'down'} />
        </Show>
      </button>
    </th>
  );
}

function NameCell(props: { person: any }) {
  return (
    <td class="cell cell--name">
      <Avatar name={props.person.name} size="md" />
      <span class="cell__text">{props.person.name}</span>
    </td>
  );
}

function EmailCell(props: { person: any }) {
  return <td class="cell cell--email">{props.person.email}</td>;
}

function RoleCell(props: { person: any }) {
  return (
    <td class="cell">
      <Badge tone={roleTone[props.person.role]} text={props.person.role} />
    </td>
  );
}

function StatusPill(props: { status: string }) {
  return (
    <span class={`pill pill--${props.status}`}>
      <span class="pill__dot" />
      {statusLabel(props.status)}
    </span>
  );
}

function StatusCell(props: { person: any }) {
  return (
    <td class="cell">
      <StatusPill status={props.person.status} />
    </td>
  );
}

function ProgressBar(props: { value: number }) {
  return (
    <div
      class="progress"
      role="progressbar"
      aria-valuenow={String(props.value)}
    >
      <div class={`progress__bar progress__bar--w${bucket(props.value)}`} />
    </div>
  );
}

function ScoreCell(props: { person: any }) {
  return (
    <td class="cell cell--score">
      <ProgressBar value={props.person.score} />
      <span class="cell__text">{`${props.person.score}%`}</span>
    </td>
  );
}

function JoinedCell(props: { person: any }) {
  return <td class="cell cell--joined">{props.person.joined}</td>;
}

function TagsCell(props: { person: any }) {
  return (
    <td class="cell cell--tags">
      <For each={props.person.tags}>{(tag: string) => <Tag text={tag} />}</For>
    </td>
  );
}

function ActionsCell(props: { person: any }) {
  const page = usePage();
  return (
    <td class="cell cell--actions">
      <IconButton
        icon="search"
        label="View"
        action={{ type: 'select-person', id: props.person.id }}
        active={page.model.selected === props.person.id}
      />
      <IconButton
        icon={props.person.starred ? 'star' : 'star-off'}
        label="Star"
        action={{ type: 'toggle-star', id: props.person.id }}
        active={props.person.starred}
      />
      <IconButton
        icon="flag"
        label="Flag"
        action={{ type: 'toggle-flag', id: props.person.id }}
        active={props.person.flagged}
      />
    </td>
  );
}

function TableRow(props: { person: any }) {
  const page = usePage();
  return (
    <tr
      class={cx(
        'row',
        page.model.selected === props.person.id && 'is-selected',
        page.isDark() && 'is-dark',
      )}
      data-person={props.person.id}
    >
      <NameCell person={props.person} />
      <EmailCell person={props.person} />
      <RoleCell person={props.person} />
      <StatusCell person={props.person} />
      <ScoreCell person={props.person} />
      <JoinedCell person={props.person} />
      <TagsCell person={props.person} />
      <ActionsCell person={props.person} />
    </tr>
  );
}

function EmptyState() {
  return <p class="empty-state">No people match this filter.</p>;
}

const column = (id: string) => SORT_COLUMNS.find((entry) => entry.id === id)!;

export function DataTable() {
  const page = usePage();
  return (
    <div class="table-wrap">
      <table class={cx('table', page.model.compact && 'is-compact')}>
        <thead>
          <tr>
            <SortHeader column={column('name')} />
            <th>Email</th>
            <SortHeader column={column('role')} />
            <SortHeader column={column('status')} />
            <SortHeader column={column('score')} />
            <SortHeader column={column('joined')} />
            <th>Tags</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <For each={page.rows()}>{(person) => <TableRow person={person} />}</For>
        </tbody>
      </table>
      <Show when={page.noRows()}>
        <EmptyState />
      </Show>
    </div>
  );
}
