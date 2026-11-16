import {
  button,
  craftComponent,
  div,
  forNode,
  ifNode,
  p,
  span,
  table,
  tbody,
  td,
  th,
  thead,
  tr,
  type Input,
} from '@craft-ts/component';
import {
  SORT_COLUMNS,
  STATUS_FILTERS,
  bucket,
  cx,
  roleTone,
  statusLabel,
  type Person,
} from '../page-common.js';
import { Page } from './store.js';
import {
  Avatar,
  Badge,
  Button,
  IconButton,
  Icon,
  Tag,
  derive,
  fixed,
  pluck,
} from './ui.js';

// -- Toolbar ----------------------------------------------------------------

type Filter = { readonly id: string; readonly label: string };

const FilterChip = craftComponent(
  'FilterChip',
  {},
  (inputs: { readonly filter: Input<Filter> }) =>
    button(
      'chip',
      {
        type: 'button',
        class: function* () {
          return cx(
            'chip',
            (yield* Page.status()) === (yield* inputs.filter()).id &&
              'is-active',
          );
        },
        *click() {
          yield* Page.model.dispatch({
            type: 'set-status',
            status: (yield* inputs.filter()).id,
          });
        },
      },
      [
        pluck(inputs.filter, 'label'),
        span({ class: 'chip__count' }, function* () {
          const counts = yield* Page.statusCounts();
          return String(counts[(yield* inputs.filter()).id as keyof typeof counts]);
        }),
      ],
    ),
);

export const Toolbar = craftComponent('Toolbar', {}, () =>
  div({ class: 'toolbar' }, [
    div(
      { class: 'toolbar__group' },
      forNode(STATUS_FILTERS, { track: (filter) => filter.id }, (filter) =>
        FilterChip({ filter }),
      ),
    ),
    div({ class: 'toolbar__group' }, [
      Button({
        label: fixed('Reset'),
        variant: fixed('secondary'),
        action: fixed({ type: 'set-status', status: 'all' }),
      }),
      Button({
        label: fixed('Density'),
        variant: fixed('ghost'),
        action: fixed('density'),
      }),
    ]),
  ]),
);

// -- Table ------------------------------------------------------------------

type Column = { readonly id: string; readonly label: string };

const SortHeader = craftComponent(
  'SortHeader',
  {},
  (inputs: { readonly column: Input<Column> }) => {
    const sorted = function* () {
      return (yield* Page.sortKey()) === (yield* inputs.column()).id;
    };
    return th(
      {
        class: function* () {
          return cx('sort-header', (yield* sorted()) && 'is-sorted');
        },
        'aria-sort': function* () {
          if (!(yield* sorted())) return 'none';
          return (yield* Page.sortDir()) === 'asc' ? 'ascending' : 'descending';
        },
      },
      button(
        'sort',
        {
          type: 'button',
          class: 'sort-header__btn',
          *click() {
            yield* Page.model.dispatch({
              type: 'set-sort',
              key: (yield* inputs.column()).id,
            });
          },
        },
        [
          pluck(inputs.column, 'label'),
          ifNode('sorted', sorted, () =>
            Icon({
              name: function* () {
                return (yield* Page.sortDir()) === 'asc' ? 'up' : 'down';
              },
            }),
          ),
        ],
      ),
    );
  },
);

type PersonInputs = { readonly person: Input<Person> };

const NameCell = craftComponent('NameCell', {}, (inputs: PersonInputs) =>
  td({ class: 'cell cell--name' }, [
    Avatar({ name: pluck(inputs.person, 'name'), size: fixed('md') }),
    span({ class: 'cell__text' }, pluck(inputs.person, 'name')),
  ]),
);

const EmailCell = craftComponent('EmailCell', {}, (inputs: PersonInputs) =>
  td({ class: 'cell cell--email' }, pluck(inputs.person, 'email')),
);

const RoleCell = craftComponent('RoleCell', {}, (inputs: PersonInputs) =>
  td(
    { class: 'cell' },
    Badge({
      tone: derive(inputs.person, (person) => roleTone[person.role]),
      text: pluck(inputs.person, 'role'),
    }),
  ),
);

const StatusPill = craftComponent(
  'StatusPill',
  {},
  (inputs: { readonly status: Input<string> }) =>
    span(
      {
        class: derive(inputs.status, (status) => `pill pill--${status}`),
      },
      [
        span({ class: 'pill__dot' }),
        derive(inputs.status, (status) => statusLabel(status)),
      ],
    ),
);

const StatusCell = craftComponent('StatusCell', {}, (inputs: PersonInputs) =>
  td({ class: 'cell' }, StatusPill({ status: pluck(inputs.person, 'status') })),
);

const ProgressBar = craftComponent(
  'ProgressBar',
  {},
  (inputs: { readonly value: Input<number> }) =>
    div(
      {
        class: 'progress',
        attrs: { role: 'progressbar' },
        'aria-valuenow': derive(inputs.value, String),
      },
      div({
        class: derive(inputs.value, (value) => `progress__bar progress__bar--w${bucket(value)}`),
      }),
    ),
);

const ScoreCell = craftComponent('ScoreCell', {}, (inputs: PersonInputs) =>
  td({ class: 'cell cell--score' }, [
    ProgressBar({ value: pluck(inputs.person, 'score') }),
    span({ class: 'cell__text' }, derive(inputs.person, (person) => `${person.score}%`)),
  ]),
);

const JoinedCell = craftComponent('JoinedCell', {}, (inputs: PersonInputs) =>
  td({ class: 'cell cell--joined' }, pluck(inputs.person, 'joined')),
);

const TagsCell = craftComponent('TagsCell', {}, (inputs: PersonInputs) =>
  td(
    { class: 'cell cell--tags' },
    forNode(
      pluck(inputs.person, 'tags'),
      { track: (_tag, index) => index },
      (tag) => Tag({ text: tag }),
    ),
  ),
);

const ActionsCell = craftComponent('ActionsCell', {}, (inputs: PersonInputs) =>
  td({ class: 'cell cell--actions' }, [
    IconButton({
      icon: fixed('search'),
      label: fixed('View'),
      action: derive(inputs.person, (person) => ({
        type: 'select-person',
        id: person.id,
      })),
      active: function* () {
        return (yield* Page.selected()) === (yield* inputs.person()).id;
      },
    }),
    IconButton({
      icon: derive(inputs.person, (person) =>
        person.starred ? 'star' : 'star-off',
      ),
      label: fixed('Star'),
      action: derive(inputs.person, (person) => ({
        type: 'toggle-star',
        id: person.id,
      })),
      active: pluck(inputs.person, 'starred'),
    }),
    IconButton({
      icon: fixed('flag'),
      label: fixed('Flag'),
      action: derive(inputs.person, (person) => ({
        type: 'toggle-flag',
        id: person.id,
      })),
      active: pluck(inputs.person, 'flagged'),
    }),
  ]),
);

const TableRow = craftComponent('TableRow', {}, (inputs: PersonInputs) =>
  tr(
    {
      class: function* () {
        return cx(
          'row',
          (yield* Page.selected()) === (yield* inputs.person()).id &&
            'is-selected',
          (yield* Page.isDark()) && 'is-dark',
        );
      },
      'data-person': pluck(inputs.person, 'id'),
    },
    [
      NameCell({ person: inputs.person }),
      EmailCell({ person: inputs.person }),
      RoleCell({ person: inputs.person }),
      StatusCell({ person: inputs.person }),
      ScoreCell({ person: inputs.person }),
      JoinedCell({ person: inputs.person }),
      TagsCell({ person: inputs.person }),
      ActionsCell({ person: inputs.person }),
    ],
  ),
);

const EmptyState = craftComponent('EmptyState', {}, () =>
  p({ class: 'empty-state' }, 'No people match this filter.'),
);

const column = (id: string) =>
  fixed(SORT_COLUMNS.find((entry) => entry.id === id)!);

export const DataTable = craftComponent('DataTable', {}, () =>
  div({ class: 'table-wrap' }, [
    table(
      {
        class: function* () {
          return cx('table', (yield* Page.compact()) && 'is-compact');
        },
      },
      [
        thead(
          tr([
            SortHeader({ column: column('name') }),
            th('Email'),
            SortHeader({ column: column('role') }),
            SortHeader({ column: column('status') }),
            SortHeader({ column: column('score') }),
            SortHeader({ column: column('joined') }),
            th('Tags'),
            th('Actions'),
          ]),
        ),
        tbody(
          forNode(Page.rows, { track: (person) => person.id }, (person) =>
            TableRow({ person }),
          ),
        ),
      ],
    ),
    ifNode(Page.noRows, () => EmptyState({})),
  ]),
);

void STATUS_FILTERS;
