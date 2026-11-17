// Browser benchmark only. Rendering and row actions use the existing declarative
// Craft API. No new imperative rendering component or product API is introduced.
import {
  bootstrapCraft,
  craftComponent,
  div,
  span,
  button,
  table,
  thead,
  tbody,
  tr,
  th,
  td,
  forNode,
  scheduleFor,
  provideCraftRootComponent,
  provideForScheduler,
  FrameForScheduler,
  type Input,
  type CraftNodeChildren,
} from '@craft-ts/component';
import {
  craftAppConfig,
  craftUse,
  ɵsignal as signal,
  ɵcomputed as computed,
  ɵsettledValueReader,
} from '@craft-ts/core';
import { InitialForScheduler } from './collections-initial-scheduler';

type Row = { id: number; label: string; status: string };
type Entry =
  | { kind: 'row'; row: Row; index: number }
  | { kind: 'gap'; start: number; length: number };
const query = new URLSearchParams(location.search);
const mode = query.get('mode') ?? 'full';
const count = Number(query.get('rows') ?? 10000);
const virtual = mode === 'windowed';
const scheduled = mode.startsWith('scheduled');
const initialScheduler =
  mode === 'scheduled-initial'
    ? new InitialForScheduler()
    : mode === 'scheduled-provided'
      ? new FrameForScheduler(4)
      : undefined;
const rows = signal(
  Array.from({ length: count }, (_, id) => ({
    id,
    label: `Row ${id}`,
    status: id % 2 ? 'active' : 'pending',
  })),
);
const firstVisible = signal(0),
  focused = signal<number | null>(null);
const viewport = document.getElementById('viewport')!;
const mount = document.getElementById('mount')!;
document.body.dataset.mode = mode;
const edit = (id: number) =>
  rows.update((previous) =>
    previous.map((row) =>
      row.id === id ? { ...row, label: row.label + '!' } : row,
    ),
  );
const Edit = craftComponent(
  'CollectionEdit',
  {},
  (inputs: { row: Input<Row> }) =>
    button(
      {
        type: 'button',
        'aria-label': function* () {
          return 'Edit row ' + (yield* inputs.row()).id;
        },
        *click() {
          edit((yield* inputs.row()).id);
        },
      },
      'Edit',
    ),
);
const ListRow = craftComponent(
  'CollectionRow',
  {},
  (inputs: { row: Input<Row>; index: Input<number> }) =>
    div(
      {
        class: 'row',
        'data-row': function* () {
          return (yield* inputs.row()).id;
        },
        'data-index': inputs.index,
      },
      [
        span({ class: 'cell id' }, function* () {
          return (yield* inputs.index()) + 1;
        }),
        span({ class: 'cell label' }, function* () {
          return (yield* inputs.row()).label;
        }),
        span({ class: 'cell status' }, function* () {
          return (yield* inputs.row()).status;
        }),
        Edit({ row: inputs.row }),
      ],
    ),
);
const TableRow = craftComponent(
  'CollectionTableRow',
  {},
  (inputs: { row: Input<Row>; index: Input<number> }) =>
    tr(
      {
        'data-row': function* () {
          return (yield* inputs.row()).id;
        },
        'data-index': inputs.index,
      },
      [
        td({ class: 'cell id' }, function* () {
          return (yield* inputs.index()) + 1;
        }),
        td({ class: 'cell label' }, function* () {
          return (yield* inputs.row()).label;
        }),
        td({ class: 'cell status' }, function* () {
          return (yield* inputs.row()).status;
        }),
        td(Edit({ row: inputs.row })),
      ],
    ),
);

// Cache only currently projected rows, so scrolling does not retain past windows.
let entriesById = new Map<number, Extract<Entry, { kind: 'row' }>>();
const projected = computed(() => {
  const data = rows();
  const start = virtual ? Math.max(0, firstVisible() - 8) : 0;
  const end = virtual
    ? Math.min(data.length, firstVisible() + 28)
    : data.length;
  const indices = new Set<number>();
  for (let index = start; index < end; index++) indices.add(index);
  if (virtual && focused() !== null) {
    const index = data.findIndex((row) => row.id === focused());
    if (index >= 0) indices.add(index);
  }
  const output: Entry[] = [],
    next = new Map<number, Extract<Entry, { kind: 'row' }>>();
  let cursor = 0;
  for (const index of [...indices].sort((a, b) => a - b)) {
    if (index > cursor)
      output.push({ kind: 'gap', start: cursor, length: index - cursor });
    const row = data[index],
      previous = entriesById.get(row.id);
    const entry =
      previous?.row === row && previous.index === index
        ? previous
        : { kind: 'row' as const, row, index };
    next.set(row.id, entry);
    output.push(entry);
    cursor = index + 1;
  }
  if (cursor < data.length)
    output.push({ kind: 'gap', start: cursor, length: data.length - cursor });
  entriesById = next;
  return output;
});
const flat = forNode(
  () => projected(),
  {
    track: (entry) =>
      entry.kind === 'row' ? 'row:' + entry.row.id : 'gap:' + entry.start,
  },
  (entry) => {
    const value = craftUse(entry());
    return value.kind === 'gap'
      ? div({
          class: 'gap',
          'aria-hidden': 'true',
          style: { height: value.length * 32 + 'px' },
        })
      : ListRow({
          row: ɵsettledValueReader(value.row),
          index: ɵsettledValueReader(value.index),
        });
  },
);
const flatBody = scheduled
  ? flat.pipe(scheduleFor({ strategy: 'frame', frameBudgetMs: 4 }))
  : flat;
const Chunk = craftComponent(
  'CollectionChunk',
  {},
  (inputs: { chunk: Input<{ id: number; values: Row[] }> }) =>
    div(
      { class: 'chunk' },
      forNode(
        function* () {
          return (yield* inputs.chunk()).values;
        },
        { track: (row) => row.id },
        (row, index) =>
          ListRow({
            row,
            index: function* () {
              return (yield* inputs.chunk()).id + (yield* index());
            },
          }),
      ),
    ),
);
// This separate cohort deliberately groups rows into stable-height block
// containers. It is identical for the baseline and content-visibility modes.
const chunks = () => {
  const values = rows(),
    output = [];
  for (let id = 0; id < values.length; id += 50)
    output.push({ id, values: values.slice(id, id + 50) });
  return output;
};
const blockBody = forNode(chunks, { track: (chunk) => chunk.id }, (chunk) =>
  Chunk({ chunk }),
);
const tableBody = table([
  thead(tr([th('Index'), th('Label'), th('Status'), th('Action')])),
  tbody(
    forNode(
      () => rows(),
      { track: (row) => row.id },
      (row, index) => TableRow({ row, index }),
    ),
  ),
]);
const body: CraftNodeChildren =
  mode === 'blocks' || mode === 'visibility'
    ? blockBody
    : mode.startsWith('table-')
      ? tableBody
      : flatBody;
const App = craftComponent('CollectionApp', {}, () =>
  div({ class: 'collection' }, body),
);

viewport.addEventListener('scroll', () => {
  if (virtual) firstVisible.set(Math.floor(viewport.scrollTop / 32));
});
viewport.addEventListener('focusin', (event) => {
  if (!virtual) return;
  const element = (event.target as Element).closest('[data-row]');
  focused.set(element ? Number(element.getAttribute('data-row')) : null);
});
viewport.addEventListener('focusout', () =>
  queueMicrotask(() => {
    if (!virtual) return;
    const element = document.activeElement?.closest('[data-row]');
    focused.set(element ? Number(element.getAttribute('data-row')) : null);
  }),
);

const longTasks: number[] = [],
  shifts: number[] = [];
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) longTasks.push(entry.duration);
}).observe({ type: 'longtask', buffered: true });
new PerformanceObserver((list) => {
  for (const entry of list.getEntries())
    if (!(entry as any).hadRecentInput) shifts.push((entry as any).value);
}).observe({ type: 'layout-shift', buffered: true });
const started = performance.now();
let due = started + 8;
const lags: number[] = [];
const heartbeat = setInterval(() => {
  const now = performance.now();
  lags.push(Math.max(0, now - due));
  due = now + 8;
}, 8);
const bench: any = {
  mode,
  count,
  ready: false,
  bootstrapMs: 0,
  firstRowsMs: undefined,
  completeMs: undefined,
  firstRowsPaintOpportunityMs: undefined,
  allRowsPaintOpportunityMs: undefined,
};
(window as any).__collectionBench = bench;
let domRows = 0,
  rowCountingMs = 0;
const observer = new MutationObserver(() => {
  const start = performance.now();
  domRows = mount.querySelectorAll('[data-row]').length;
  rowCountingMs += performance.now() - start;
});
observer.observe(mount, { subtree: true, childList: true });
const app = bootstrapCraft({
  host: mount,
  mode: 'production',
  config: craftAppConfig({
    providers: [
      provideCraftRootComponent(App),
      ...(initialScheduler ? [provideForScheduler(initialScheduler)] : []),
    ],
  }),
});
bench.bootstrapMs = performance.now() - started;
let destroyed = false,
  finishFrame = 0;
const twoFrames = (callback: () => void) =>
  requestAnimationFrame(() => requestAnimationFrame(callback));
const watch = () => {
  if (destroyed) return;
  if (
    bench.firstRowsMs === undefined &&
    domRows >= Math.min(20, rows().length)
  ) {
    bench.firstRowsMs = performance.now() - started;
    twoFrames(() => {
      bench.firstRowsPaintOpportunityMs = performance.now() - started;
    });
  }
  const expected = virtual
    ? projected().filter((entry) => entry.kind === 'row').length
    : rows().length;
  if (domRows === expected && expected > 0) {
    if (bench.completeMs === undefined) {
      bench.completeMs = performance.now() - started;
      finishFrame++;
      twoFrames(() => {
        bench.allRowsPaintOpportunityMs = performance.now() - started;
        bench.ready = true;
        clearInterval(heartbeat);
      });
    }
  }
  if (!bench.ready) requestAnimationFrame(watch);
};
requestAnimationFrame(watch);
bench.stats = () => ({
  bootstrapMs: bench.bootstrapMs,
  firstRowsMs: bench.firstRowsMs,
  completeMs: bench.completeMs,
  firstRowsPaintOpportunityMs: bench.firstRowsPaintOpportunityMs,
  allRowsPaintOpportunityMs: bench.allRowsPaintOpportunityMs,
  domRows,
  rowCountingMs,
  longTasks: [...longTasks],
  maxLongTaskMs: Math.max(0, ...longTasks),
  maxTimerLagMs: Math.max(0, ...lags),
  layoutShift: shifts.reduce((a, b) => a + b, 0),
  elements: mount.querySelectorAll('*').length,
});
bench.rows = () => rows().map((row) => ({ ...row }));
bench.mutate = () => rows.set(rows().filter((row) => row.id % 2 === 0));
bench.reverse = () => rows.update((data) => [...data].reverse());
bench.update = () => edit(rows()[0].id);
bench.destroy = () => {
  destroyed = true;
  app.destroy();
  initialScheduler?.destroy();
  observer.disconnect();
  clearInterval(heartbeat);
};
bench.setLongLabel = () =>
  rows.update((data) =>
    data.map((row, index) =>
      index === data.length - 1 ? { ...row, label: 'W'.repeat(300) } : row,
    ),
  );
bench.settled = () => {
  const data = rows();
  const expected = virtual
    ? projected().filter(
        (entry): entry is Extract<Entry, { kind: 'row' }> =>
          entry.kind === 'row',
      )
    : [
        { row: data[0], index: 0 },
        { row: data[data.length - 1], index: data.length - 1 },
      ];
  if (!expected.length) return domRows === 0;
  return [expected[0], expected[expected.length - 1]].every((entry) => {
    const element = mount.querySelector('[data-row="' + entry.row.id + '"]');
    return (
      element?.getAttribute('data-index') === String(entry.index) &&
      element.querySelector('.label')?.textContent === entry.row.label
    );
  });
};
let nextId = count;
bench.append = () =>
  rows.update((data) => [
    ...data,
    ...Array.from({ length: 1000 }, () => {
      const id = nextId++;
      return { id, label: 'Row ' + id, status: 'active' };
    }),
  ]);
bench.longTaskCount = () => longTasks.length;
bench.longTasksSince = (index: number) => longTasks.slice(index);
