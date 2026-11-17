// EXPERIMENT: an imperative keyed table, not a supported rendering API.
import {
  craftComponent,
  table,
  tbody,
  tr,
  td,
  button,
  forNode,
  type CraftNode,
  type Input,
} from '@craft-ts/component';
import {
  craftNodeDirective,
  ɵsignal as signal,
  ɵuntracked as untracked,
  ɵinjectCraftNodeEffectFactoryIn,
  type CraftNodeDirectiveContext,
} from '@craft-ts/core';

type Row = { id: number; label: string; score: number };
type MountedSlot = { update(node: CraftNode): void; destroy(): void };
type PrototypeContext = CraftNodeDirectiveContext & {
  prototypeMount(node: CraftNode, host: Element, key: string): MountedSlot;
};

export function fixture(
  count: number,
  mode: string,
  withButtons: boolean,
  instrument = false,
) {
  const rows = signal<Row[]>(
    Array.from({ length: count }, (_, id) => ({
      id,
      label: id === 0 ? '<unsafe & text>' : `Row ${id}`,
      score: id % 100,
    })),
  );
  const lifecycle = { mounted: 0, destroyed: 0, clicks: [] as number[] };
  const lifetime = craftNodeDirective('PrototypeButtonLifetime', [], () => {
    lifecycle.mounted++;
    return () => {
      lifecycle.destroyed++;
    };
  });
  const edit = (id: number) => {
    lifecycle.clicks.push(id);
    rows.update((previous) =>
      previous.map((row) =>
        row.id === id ? { ...row, label: row.label + '!' } : row,
      ),
    );
  };
  // An explicit metadata field keeps these as ordinary Craft components in
  // every variant, including the lean build. The experiment measures retaining
  // full component ownership for the interactive islands.
  const Edit = craftComponent(
    'PrototypeEdit',
    { providers: [] },
    (inputs: { row: Input<Row> }) => {
      const node = button(
        {
          'data-edit': function* () {
            return (yield* inputs.row()).id;
          },
          title: function* () {
            return (yield* inputs.row()).label;
          },
          *click() {
            edit((yield* inputs.row()).id);
          },
        },
        'Edit',
      );
      return instrument ? node.pipe(lifetime) : node;
    },
  );
  const PlainRow = craftComponent(
    'PrototypePlainRow',
    {},
    (inputs: { row: Input<Row> }) =>
      tr(
        {
          'data-row': function* () {
            return (yield* inputs.row()).id;
          },
        },
        [
          td(function* () {
            return (yield* inputs.row()).id;
          }),
          td(function* () {
            return (yield* inputs.row()).label;
          }),
          td(function* () {
            return (yield* inputs.row()).score;
          }),
        ],
      ),
  );
  const InteractiveRow = craftComponent(
    'PrototypeInteractiveRow',
    {},
    (inputs: { row: Input<Row> }) =>
      tr(
        {
          'data-row': function* () {
            return (yield* inputs.row()).id;
          },
        },
        [
          td(function* () {
            return (yield* inputs.row()).id;
          }),
          td(function* () {
            return (yield* inputs.row()).label;
          }),
          td(function* () {
            return (yield* inputs.row()).score;
          }),
          td(Edit({ row: inputs.row })),
        ],
      ),
  );

  const imperative = craftNodeDirective(
    'PrototypeImperativeTable',
    [],
    (raw) => {
      const context = raw as PrototypeContext;
      const dom = context.renderer;
      const views = new Map<
        number,
        {
          row: Row;
          element: Element;
          label: Text;
          score: Text;
          slot?: MountedSlot;
          reader: () => Generator<never, Row, unknown>;
        }
      >();
      // A single effect owns the keyed diff. Native cells have no per-cell effect.
      const effect = ɵinjectCraftNodeEffectFactoryIn(context.injector)(
        'rows',
        () => {
          const data = rows();
          untracked(() => {
            const live = new Set(data.map((row) => row.id));
            for (const [key, view] of views)
              if (!live.has(key)) {
                view.slot?.destroy();
                dom.removeChild(context.element, view.element);
                views.delete(key);
              }
            let before: Node | null = null;
            for (let i = data.length - 1; i >= 0; i--) {
              const row = data[i];
              let view = views.get(row.id);
              if (!view) {
                const element = dom.createElement('tr');
                dom.setAttribute(element, 'data-row', String(row.id));
                const idCell = dom.createElement('td');
                const labelCell = dom.createElement('td');
                const scoreCell = dom.createElement('td');
                const label = dom.createText(row.label),
                  score = dom.createText(String(row.score));
                dom.appendChild(idCell, dom.createText(String(row.id)));
                dom.appendChild(labelCell, label);
                dom.appendChild(scoreCell, score);
                dom.appendChild(element, idCell);
                dom.appendChild(element, labelCell);
                dom.appendChild(element, scoreCell);
                const created = {
                  row,
                  element,
                  label,
                  score,
                  reader: undefined! as () => Generator<never, Row, unknown>,
                  slot: undefined as MountedSlot | undefined,
                };
                created.reader = function* () {
                  return created.row;
                };
                view = created;
                views.set(row.id, view);
                // Attach before mounting a component: its lifecycle observes the
                // same connected parent as the declarative path, not a staging DOM.
                dom.insertBefore(context.element, element, before);
                if (withButtons) {
                  const cell = dom.createElement('td');
                  dom.appendChild(element, cell);
                  view.slot = context.prototypeMount(
                    Edit({ row: view.reader }),
                    cell,
                    String(row.id),
                  );
                }
              } else {
                if (view.row !== row) {
                  if (view.row.label !== row.label)
                    dom.setValue(view.label, row.label);
                  if (view.row.score !== row.score)
                    dom.setValue(view.score, String(row.score));
                  view.row = row;
                  view.slot?.update(
                    Edit({
                      row: function* () {
                        return row;
                      },
                    }),
                  );
                }
                if (view.element.nextSibling !== before)
                  dom.insertBefore(context.element, view.element, before);
              }
              before = view.element;
            }
          });
        },
      );
      return () => {
        effect.destroy();
        for (const view of views.values()) {
          view.slot?.destroy();
          dom.removeChild(context.element, view.element);
        }
        views.clear();
      };
    },
  );
  const App = craftComponent('PrototypeTable', {}, () =>
    table({}, [
      mode === 'manual'
        ? tbody().pipe(imperative)
        : tbody({}, [
            withButtons
              ? forNode(
                  () => rows(),
                  { track: (row) => row.id },
                  (row) => InteractiveRow({ row }),
                )
              : forNode(
                  () => rows(),
                  { track: (row) => row.id },
                  (row) => PlainRow({ row }),
                ),
          ]),
    ]),
  );
  let saved: Row[];
  function action(name: string) {
    if (name === 'one' || name === 'tenth')
      rows.update((previous) =>
        previous.map((row, i) =>
          (name === 'one' ? i === 0 : i % 10 === 0)
            ? { ...row, label: row.label + '!' }
            : row,
        ),
      );
    else if (name === 'reverse')
      rows.update((previous) => [...previous].reverse());
    else if (name === 'filter') {
      saved = rows();
      rows.set(rows().filter((row) => row.id % 2 === 0));
    } else if (name === 'restore') rows.set(saved);
    else if (name === 'insert')
      rows.update((previous) => [
        ...previous,
        { id: count + 1, label: 'Added', score: 42 },
      ]);
    else throw Error(name);
  }
  return { App, action, lifecycle, rows };
}
