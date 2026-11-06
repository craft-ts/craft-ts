// PROTOTYPE contract fixture, never loaded by the ordinary benchmark.
import {
  bootstrapCraft,
  craftComponent,
  div,
  span,
  forNode,
  provideCraftRootComponent,
  type Input,
} from '@craft-ts/component';
import {
  craftSignal,
  craftUse,
  craftAppConfig,
  CraftRenderIdentity,
  AppSnapshotRegistry,
  ɵinject,
  ɵInjector,
  ɵElementRef,
  ɵDestroyRef,
  HOST_TAG_LIST,
  ɵcaptureCraftReplayTarget,
  ɵresolveCraftReplayTarget,
} from '@craft-ts/core';

const params = new URLSearchParams(location.search);
const pure = params.get('pure') === 'true';
const prepared = params.get('plan') === 'true';
const providers = params.get('providers') === 'true';
class RootToken {}
class LocalToken {}
const rows = craftSignal(
  [101, 202, 303].map((id) => ({ id, label: `Row ${id}`, extra: 'old' })),
);
const branch = craftSignal(0),
  readLate = craftSignal(false),
  outside = craftSignal('A');
const owners = new Map<number, any>(),
  destroyed: number[] = [];
const seen = new WeakSet<object>();
function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const Row = craftComponent(
  'FrameworkBenchRow',
  {
    providers: providers ? [{ provide: LocalToken, useValue: 'child' }] : [],
  },
  (inputs: {
    row: Input<{ id: number; label: string; extra: string }>;
    position: Input<number>;
    unused: Input<string>;
  }) => {
    const row = craftUse(inputs.row());
    const index = craftUse(inputs.position());
    const extra = readLate() ? craftUse(inputs.unused()) : '';
    const owner = ɵinject(ɵInjector);
    expect(String(ɵinject(RootToken)) === 'root', 'Root provider resolution');
    expect(
      String(ɵinject(LocalToken)) === (providers ? 'child' : 'parent'),
      'Local provider resolution',
    );
    expect(
      String(ɵinject(LocalToken, { skipSelf: true })) === 'parent',
      'skipSelf resolution',
    );
    expect(owner.getOptional(class Missing {}) === null, 'Optional miss');
    expect(
      ɵinject(ɵElementRef).nativeElement.id === 'contract-rows',
      'ElementRef scope',
    );
    const identity = craftUse(CraftRenderIdentity());
    expect(
      identity.path.includes('FrameworkBenchRow'),
      'Render identity scope',
    );
    expect(
      owner
        .get(HOST_TAG_LIST, [])
        .some((tag) => tag.startsWith('component:FrameworkBenchRow#')),
      'Host tags',
    );
    if (owners.has(row.id))
      expect(owners.get(row.id) === owner, 'Owner identity changed');
    owners.set(row.id, owner);
    if (!seen.has(owner)) {
      seen.add(owner);
      ɵinject(ɵDestroyRef).onDestroy(() => destroyed.push(row.id));
    }
    const text = row.label + (extra ? `|${extra}` : '');
    if (branch() === 1) return [];
    if (branch() === 2)
      return [
        div({ 'data-row': row.id }, text),
        span({ 'data-extra': row.id }, 'extra'),
      ];
    if (prepared)
      return {
        kind: 'element',
        tag: 'div',
        props: { 'data-row': row.id },
        children: [],
        __prototypePreparedRow: {
          id: row.id,
          label: text,
          indexes: true,
          position: index,
        },
      } as any;
    return div({ 'data-row': row.id }, [
      span({ 'data-position': index }, `${index + 1}. `),
      text,
    ]);
  },
);
const item = (
  row: Input<{ id: number; label: string; extra: string }>,
  position: Input<number>,
) =>
  Row({
    row,
    position,
    unused: function* () {
      return (yield* row()).extra;
    },
  });
if (pure) Object.assign(item, { __craftPureItemPrototype: true });
const Root = craftComponent(
  'FloorContractRoot',
  {
    providers: [
      { provide: RootToken, useValue: 'root' },
      { provide: LocalToken, useValue: 'parent' },
    ],
  },
  () =>
    div({}, [
      div(
        { id: 'contract-rows' },
        forNode(rows, { track: (row) => row.id }, item),
      ),
      div(
        { id: 'external' },
        forNode([1], { track: (value) => value }, () => span({}, outside())),
      ),
    ]),
);
const app = bootstrapCraft({
  host: document.getElementById('mount')!,
  mode: 'production',
  config: craftAppConfig({ providers: [provideCraftRootComponent(Root)] }),
});
const registry = app.injector.run(() => craftUse(AppSnapshotRegistry()));
const frame = () =>
  new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
(globalThis as any).__runFloorContracts = async (recorded?: any[]) => {
  const targets = [
    ...document.querySelectorAll(
      '#contract-rows [data-row], #contract-rows [data-position]',
    ),
  ].map((element) => ({
    key: element.hasAttribute('data-row')
      ? `row:${element.getAttribute('data-row')}`
      : `position:${element.getAttribute('data-position')}`,
    target: ɵcaptureCraftReplayTarget(element),
  }));
  expect(
    targets.every(
      (x) =>
        x.target && ɵresolveCraftReplayTarget(x.target).status === 'resolved',
    ),
    'Initial replay targets',
  );
  if (recorded)
    for (const entry of recorded) {
      const result = ɵresolveCraftReplayTarget(entry.target);
      expect(
        result.status === 'resolved',
        'Recorded target did not resolve in candidate',
      );
      if (result.status === 'resolved') {
        const [kind, value] = entry.key.split(':');
        expect(
          result.element.getAttribute(
            kind === 'row' ? 'data-row' : 'data-position',
          ) === value,
          'Recorded target resolved to a different element',
        );
      }
    }
  const first = document.querySelector('[data-row="101"]');
  rows.set(
    rows().map((row) =>
      row.id === 101 ? { ...row, label: 'Updated', extra: 'latest' } : row,
    ),
  );
  await frame();
  expect(
    document.querySelector('[data-row="101"]') === first,
    'Immutable update lost row node',
  );
  expect(first?.textContent?.includes('Updated'), 'Immutable update missed');
  readLate.set(true);
  await frame();
  expect(first?.textContent?.includes('latest'), 'Late input read stale');
  outside.set('B');
  await frame();
  expect(
    document.querySelector('#external')?.textContent === 'B',
    'Unmarked reactive item stopped tracking',
  );
  rows.set([...rows()].reverse());
  await frame();
  expect(
    document
      .querySelector('#contract-rows [data-row]')
      ?.getAttribute('data-row') === '303',
    'Wrong reverse',
  );
  expect(
    document.querySelector('[data-row="101"]') === first,
    'Reverse lost row identity',
  );
  for (const entry of targets)
    expect(
      ɵresolveCraftReplayTarget(entry.target!).status === 'resolved',
      'Target lost after reverse',
    );
  branch.set(1);
  await frame();
  expect(
    document.querySelectorAll('#contract-rows [data-row]').length === 0,
    'Empty transition',
  );
  branch.set(2);
  await frame();
  expect(
    document.querySelectorAll('#contract-rows [data-extra]').length === 3,
    'Multiple-root transition',
  );
  branch.set(0);
  await frame();
  expect(
    document.querySelectorAll('#contract-rows [data-row]').length === 3,
    'Return to single root',
  );
  rows.set(rows().filter((row) => row.id !== 202));
  await frame();
  expect(JSON.stringify(destroyed) === '[202]', 'Per-row destruction scope');
  const owner = owners.get(202);
  expect(owner.destroyed, 'Removed owner not destroyed');
  let rejected = false;
  try {
    owner.createChild([]);
  } catch {
    rejected = true;
  }
  expect(rejected, 'Destroyed owner accepts children');
  const beforeDestroy = registry.activeEffects().length;
  app.destroy();
  expect(registry.activeEffects().length === 0, 'Effects remain after destroy');
  expect(
    document.querySelectorAll('[data-row]').length === 0,
    'Rows remain after destroy',
  );
  expect(
    new Set(destroyed).size === 3 && destroyed.length === 3,
    'Cleanup count/order duplicates',
  );
  return {
    providers,
    pure,
    prepared,
    targets,
    beforeDestroy,
    cleaned: [...destroyed],
    checks: 15,
    recordedTargetsResolved: recorded?.length ?? 0,
  };
};
