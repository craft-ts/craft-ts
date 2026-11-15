import {
  bootstrapCraft,
  craftComponent,
  div,
  span,
  forNode,
  provideCraftRootComponent,
  type Input,
} from './component';
import {
  craftAppConfig,
  craftService,
  state,
  craftComputed,
  craftUse,
  ɵinject,
  ɵInjector,
  ɵrunInInjectionContext,
} from '@craft-ts/core';
import {
  initialModel,
  visibleRows,
  reduce,
  settings,
  begin,
  installActionHandler,
} from '../common.js';
const { Bench, provideBench } = craftService(
  { name: 'Bench', providedIn: 'toProvide' },
  function* () {
    const model = yield* state('model', initialModel, ({ update }) => ({
      action: (action: string) =>
        update((previous) => reduce(previous, action)),
    }));
    yield* craftComputed('rows', function* () {
      return visibleRows(yield* model());
    });
    yield* craftComputed('revision', function* () {
      return (yield* model()).revision;
    });
  },
);
const Row = craftComponent(
  'FrameworkBenchRow',
  {},
  (inputs: {
    row: Input<{ id: number; label: string }>;
    position: Input<number>;
  }) =>
    div(
      {
        'data-row': function* () {
          return (yield* inputs.row()).id;
        },
      },
      [
        settings.indexes
          ? span({ 'data-position': inputs.position }, function* () {
              return `${(yield* inputs.position()) + 1}. `;
            })
          : null,
        function* () {
          return (yield* inputs.row()).label;
        },
      ],
    ),
);
const App = craftComponent(
  'FrameworkBenchApp',
  { providers: [provideBench()] },
  () => {
    const injector = ɵinject(ɵInjector);
    installActionHandler((action) =>
      ɵrunInInjectionContext(injector, () =>
        craftUse(Bench.model.action(action)),
      ),
    );
    return div(
      { id: 'rows', 'data-revision': Bench.revision },
      forNode(Bench.rows, { track: (row) => row.id }, (row, index) =>
        Row({ row, position: index }),
      ),
    );
  },
);
begin();
bootstrapCraft({
  host: document.getElementById('mount')!,
  mode: 'production',
  config: craftAppConfig({ providers: [provideCraftRootComponent(App)] }),
});
