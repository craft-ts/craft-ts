import {
  bootstrapCraft,
  craftComponent,
  div,
  span,
  forNode,
  provideCraftRootComponent,
  type Input,
} from '@craft-ts/component';
import { craftAppConfig, ɵsignal as signal } from '@craft-ts/core';

const params = new URLSearchParams(location.search);
const count = Number(params.get('rows') ?? 1000);
const variant = params.get('case') ?? 'rows';
const instrument = params.get('counts') === 'true';
const reads = { a: 0, b: 0 };
const rows = signal(
  Array.from({ length: count }, (_, id) => ({ id, label: `Row ${id}` })),
);
const revision = signal(0);
const values = Array.from({ length: 128 }, (_, i) => signal(`Field ${i}`));
const read = (index: number) => {
  if (instrument) reads[index === 0 ? 'a' : 'b']++;
  return values[index]();
};
const Row = craftComponent(
  'CompilerBenchRow',
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
      function* () {
        return (yield* inputs.row()).label;
      },
    ),
);
const IndexedRow = craftComponent(
  'CompilerBenchIndexedRow',
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
        span({ 'data-position': inputs.position }, function* () {
          return `${(yield* inputs.position()) + 1}. `;
        }),
        function* () {
          return (yield* inputs.row()).label;
        },
      ],
    ),
);
const Leaf = craftComponent(
  'CompilerBenchLeaf',
  {},
  (inputs: { row: Input<{ id: number; label: string }> }) =>
    span(
      {
        'data-row': function* () {
          return (yield* inputs.row()).id;
        },
      },
      function* () {
        return (yield* inputs.row()).label;
      },
    ),
);
const Level1 = craftComponent(
  'CompilerBenchLevel1',
  {},
  (inputs: { row: Input<{ id: number; label: string }> }) =>
    div(Leaf({ row: inputs.row })),
);
const Level2 = craftComponent(
  'CompilerBenchLevel2',
  {},
  (inputs: { row: Input<{ id: number; label: string }> }) =>
    div(Level1({ row: inputs.row })),
);
const Level3 = craftComponent(
  'CompilerBenchLevel3',
  {},
  (inputs: { row: Input<{ id: number; label: string }> }) =>
    div(Level2({ row: inputs.row })),
);
// Experimental floor only: same native DOM, fewer component owners. This is
// deliberately a separate control, never an automatic compiler rewrite.
const Flat = craftComponent(
  'CompilerBenchFlat',
  {},
  (inputs: { row: Input<{ id: number; label: string }> }) =>
    div(
      div(
        div(
          span(
            {
              'data-row': function* () {
                return (yield* inputs.row()).id;
              },
            },
            function* () {
              return (yield* inputs.row()).label;
            },
          ),
        ),
      ),
    ),
);
// This fixed shape makes each of 128 independent fields statically visible.
const Fields = craftComponent('CompilerBenchFields', {}, () =>
  div([
    span(() => read(0)),
    span(() => read(1)),
    span(() => read(2)),
    span(() => read(3)),
    span(() => read(4)),
    span(() => read(5)),
    span(() => read(6)),
    span(() => read(7)),
    span(() => read(8)),
    span(() => read(9)),
    span(() => read(10)),
    span(() => read(11)),
    span(() => read(12)),
    span(() => read(13)),
    span(() => read(14)),
    span(() => read(15)),
    span(() => read(16)),
    span(() => read(17)),
    span(() => read(18)),
    span(() => read(19)),
    span(() => read(20)),
    span(() => read(21)),
    span(() => read(22)),
    span(() => read(23)),
    span(() => read(24)),
    span(() => read(25)),
    span(() => read(26)),
    span(() => read(27)),
    span(() => read(28)),
    span(() => read(29)),
    span(() => read(30)),
    span(() => read(31)),
    span(() => read(32)),
    span(() => read(33)),
    span(() => read(34)),
    span(() => read(35)),
    span(() => read(36)),
    span(() => read(37)),
    span(() => read(38)),
    span(() => read(39)),
    span(() => read(40)),
    span(() => read(41)),
    span(() => read(42)),
    span(() => read(43)),
    span(() => read(44)),
    span(() => read(45)),
    span(() => read(46)),
    span(() => read(47)),
    span(() => read(48)),
    span(() => read(49)),
    span(() => read(50)),
    span(() => read(51)),
    span(() => read(52)),
    span(() => read(53)),
    span(() => read(54)),
    span(() => read(55)),
    span(() => read(56)),
    span(() => read(57)),
    span(() => read(58)),
    span(() => read(59)),
    span(() => read(60)),
    span(() => read(61)),
    span(() => read(62)),
    span(() => read(63)),
    span(() => read(64)),
    span(() => read(65)),
    span(() => read(66)),
    span(() => read(67)),
    span(() => read(68)),
    span(() => read(69)),
    span(() => read(70)),
    span(() => read(71)),
    span(() => read(72)),
    span(() => read(73)),
    span(() => read(74)),
    span(() => read(75)),
    span(() => read(76)),
    span(() => read(77)),
    span(() => read(78)),
    span(() => read(79)),
    span(() => read(80)),
    span(() => read(81)),
    span(() => read(82)),
    span(() => read(83)),
    span(() => read(84)),
    span(() => read(85)),
    span(() => read(86)),
    span(() => read(87)),
    span(() => read(88)),
    span(() => read(89)),
    span(() => read(90)),
    span(() => read(91)),
    span(() => read(92)),
    span(() => read(93)),
    span(() => read(94)),
    span(() => read(95)),
    span(() => read(96)),
    span(() => read(97)),
    span(() => read(98)),
    span(() => read(99)),
    span(() => read(100)),
    span(() => read(101)),
    span(() => read(102)),
    span(() => read(103)),
    span(() => read(104)),
    span(() => read(105)),
    span(() => read(106)),
    span(() => read(107)),
    span(() => read(108)),
    span(() => read(109)),
    span(() => read(110)),
    span(() => read(111)),
    span(() => read(112)),
    span(() => read(113)),
    span(() => read(114)),
    span(() => read(115)),
    span(() => read(116)),
    span(() => read(117)),
    span(() => read(118)),
    span(() => read(119)),
    span(() => read(120)),
    span(() => read(121)),
    span(() => read(122)),
    span(() => read(123)),
    span(() => read(124)),
    span(() => read(125)),
    span(() => read(126)),
    span(() => read(127)),
  ]),
);
const App = craftComponent('CompilerBenchApp', {}, () =>
  div(
    { 'data-revision': () => revision() },
    variant === 'fields'
      ? Fields({})
      : variant === 'indexed'
        ? forNode(
            () => rows(),
            { track: (row) => row.id },
            (row, position) => IndexedRow({ row, position }),
          )
        : variant === 'nested'
          ? forNode(
              () => rows(),
              { track: (row) => row.id },
              (row) => Level3({ row }),
            )
          : variant === 'flat'
            ? forNode(
                () => rows(),
                { track: (row) => row.id },
                (row) => Flat({ row }),
              )
            : forNode(
                () => rows(),
                { track: (row) => row.id },
                (row, position) => Row({ row, position }),
              ),
  ),
);
const start = performance.now();
const app = bootstrapCraft({
  host: document.getElementById('mount')!,
  mode: 'production',
  config: craftAppConfig({ providers: [provideCraftRootComponent(App)] }),
});
const bench: any = { reads, mountMs: performance.now() - start, ready: false };
(globalThis as any).__compilerBench = bench;
const settle = () =>
  new Promise<void>((resolve) => queueMicrotask(() => resolve()));
bench.run = async (action: string) => {
  const started = performance.now();
  if (action === 'field-first') values[0].set(values[0]() + '!');
  else if (action === 'field-last') values[127].set(values[127]() + '!');
  else if (action === 'update-one' || action === 'update-tenth')
    rows.update((previous) =>
      previous.map((row, i) =>
        (action === 'update-one' ? i === 0 : i % 10 === 0)
          ? { ...row, label: row.label + '!' }
          : row,
      ),
    );
  else if (action === 'reverse')
    rows.update((previous) => [...previous].reverse());
  else if (action === 'filter') {
    bench.saved = rows();
    rows.set(rows().filter((row) => row.id % 2 === 0));
  } else if (action === 'restore') rows.set(bench.saved);
  else if (action === 'destroy') app.destroy();
  else throw Error('Unknown action ' + action);
  if (action !== 'destroy') revision.update((x) => x + 1);
  await settle();
  return performance.now() - started;
};
await settle();
bench.ready = true;
bench.navigationToReadyMs = performance.now();
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    bench.twoFramesMs = performance.now();
  }),
);
