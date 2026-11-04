import 'virtual:craft-style.css';
import {
  bootstrapCraft,
  button,
  craftComponent,
  div,
  forNode,
  heading,
  p,
  span,
  scheduleFor,
  provideCraftRootComponent,
  type Input,
} from '@craft-ts/component';
import {
  craftAppConfig,
  craftComputed,
  craftService,
  state,
} from '@craft-ts/core';
import { smokeStyle } from './smoke.style';
import { version } from './version';

declare global {
  interface Window {
    __smoke: {
      renders: number;
      rowTemplates: number;
      itemBindings: number;
      indexBindings: number;
      longTasks: { start: number; duration: number }[];
      bootstrapMs?: number;
      readyMs?: number;
    };
  }
}

interface Row {
  id: number;
  label: string;
}

const parameters = new URLSearchParams(location.search);
const requestedRows = Number(parameters.get('rows') ?? 1000);
const showIndexes = parameters.get('indexes') === 'true';
const scheduled = parameters.get('scheduled') === 'true';
const useComponents = parameters.get('components') !== 'false';
const rowCount =
  Number.isInteger(requestedRows) &&
  requestedRows >= 0 &&
  requestedRows <= 10000
    ? requestedRows
    : 1000;
const initialRows = Array.from({ length: rowCount }, (_, id) => ({
  id,
  label: `Row ${id}`,
}));

const { Smoke, provideSmoke } = craftService(
  { name: 'Smoke', providedIn: 'toProvide' },
  function* () {
    yield* state('count', 0, ({ update }) => ({
      increment: () => update((n) => n + 1),
    }));
    const rows = yield* state('rows', initialRows, ({ update }) => ({
      updateOne: () =>
        update((current) =>
          current.map((row, i) =>
            i === 0 ? { ...row, label: `${row.label}!` } : row,
          ),
        ),
      updateEveryTenth: () =>
        update((current) =>
          current.map((row, i) =>
            i % 10 === 0 ? { ...row, label: `${row.label}!` } : row,
          ),
        ),
      reverse: () => update((current) => [...current].reverse()),
    }));
    const filtered = yield* state('filtered', false, ({ update }) => ({
      toggle: () => update((value) => !value),
    }));
    yield* craftComputed('visibleRows', function* () {
      const current = yield* rows();
      return (yield* filtered())
        ? current.filter((row) => row.id % 2 === 0)
        : current;
    });
  },
);

const RowComponent = craftComponent(
  'SmokeRow',
  {},
  (inputs: { row: Input<Row>; position: Input<number> }) => {
    window.__smoke.renders++;
    return div(
      {
        'data-row': function* () {
          return (yield* inputs.row()).id;
        },
      },
      [
        showIndexes
          ? span(
              {
                'data-position': function* () {
                  window.__smoke.indexBindings++;
                  return yield* inputs.position();
                },
              },
              function* () {
                return `${(yield* inputs.position()) + 1}. `;
              },
            )
          : null,
        function* () {
          window.__smoke.itemBindings++;
          return (yield* inputs.row()).label;
        },
      ],
    );
  },
);

const App = craftComponent(
  'PerformanceSmoke',
  { providers: [provideSmoke()] },
  () =>
    div({ class: smokeStyle.root }, [
      heading('CraftTS performance smoke'),
      p({ id: 'version' }, version),
      p(
        'Liste avec clés stables et un composant enfant par ligne. ?rows=1000 pour changer la taille.',
      ),
      p({ id: 'count' }, Smoke.count),
      button(
        'increment',
        { id: 'increment', click: Smoke.count.increment },
        'Compteur',
      ),
      button(
        'updateOne',
        { id: 'update-one', click: Smoke.rows.updateOne },
        'Modifier une ligne',
      ),
      button(
        'updateTenth',
        { id: 'update-tenth', click: Smoke.rows.updateEveryTenth },
        'Modifier 10 %',
      ),
      button(
        'reverse',
        { id: 'reverse', click: Smoke.rows.reverse },
        'Inverser',
      ),
      button(
        'filter',
        { id: 'filter', click: Smoke.filtered.toggle },
        'Filtrer la moitié',
      ),
      div(
        { id: 'rows' },
        forNode(Smoke.visibleRows, { track: (row) => row.id }, (row, index) => {
          window.__smoke.rowTemplates++;
          return useComponents
            ? RowComponent({ row, position: index })
            : div(
                {
                  'data-row': function* () {
                    return (yield* row()).id;
                  },
                },
                [
                  showIndexes
                    ? span(
                        {
                          'data-position': function* () {
                            window.__smoke.indexBindings++;
                            return yield* index();
                          },
                        },
                        function* () {
                          return `${(yield* index()) + 1}. `;
                        },
                      )
                    : null,
                  function* () {
                    window.__smoke.itemBindings++;
                    return (yield* row()).label;
                  },
                ],
              );
        }).pipe(scheduleFor({ enabled: scheduled, strategy: 'frame' })),
      ),
    ]),
);

const started = performance.now();
bootstrapCraft({
  config: craftAppConfig({ providers: [provideCraftRootComponent(App)] }),
  mode:
    parameters.get('runtime') === 'development' || import.meta.env.DEV
      ? 'development'
      : 'production',
});
window.__smoke.bootstrapMs = performance.now() - started;
// Two frames include an opportunity to paint. This is not an INP measurement.
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    window.__smoke.readyMs = performance.now();
    document.documentElement.dataset['smokeReady'] = 'true';
  }),
);
