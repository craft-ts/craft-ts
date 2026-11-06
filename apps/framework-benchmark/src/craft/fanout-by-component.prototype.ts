// PROTOTYPE — 32/128 independent fields: update one, count affected reads.
// No library changes. This only tests synchronous bindings and DOM replay targets.
import {
  bootstrapCraft,
  craftComponent,
  div,
  span,
  provideCraftRootComponent,
} from '@craft-ts/component';
import {
  craftSignal,
  craftAppConfig,
  craftUse,
  AppSnapshotRegistry,
  ɵcaptureCraftReplayTarget,
  ɵresolveCraftReplayTarget,
} from '@craft-ts/core';

const params = new URLSearchParams(location.search);
const coarse = params.get('strategy') === 'component';
const fieldCount = Number(params.get('fields') ?? 32);
const countReads = params.get('counts') === 'true';
const fields = Array.from({ length: fieldCount }, () => craftSignal(0));
let registry: import('@craft-ts/core').AppSnapshotRegistry | undefined;
let reads = fields.map(() => 0);
let renders = 0;
function readField(index: number): string {
  if (countReads) reads[index]++;
  return String(fields[index]());
}
const Fields = craftComponent('FanoutFieldsPrototype', {}, () => {
  if (countReads) renders++;
  return div(
    { id: 'fanout' },
    fields.map((_, index) =>
      span(
        { 'data-field': index },
        coarse ? readField(index) : () => readField(index),
      ),
    ),
  );
});
const probe = ((globalThis as any).__componentFanout = {
  bootstrapMs: undefined as number | undefined,
  reads: () => ({ fields: [...reads], renders }),
  reset: () => {
    reads = fields.map(() => 0);
    renders = 0;
  },
  effects: () =>
    (registry ??= app.injector.run(() =>
      craftUse(AppSnapshotRegistry()),
    )).activeEffects(),
  targets: () =>
    [...document.querySelectorAll('[data-field]')].map((element) =>
      ɵcaptureCraftReplayTarget(element),
    ),
  resolve: (targets: any[]) =>
    targets.map((target) => {
      const result = ɵresolveCraftReplayTarget(target);
      return result.status === 'resolved'
        ? {
            status: result.status,
            field: result.element.getAttribute('data-field'),
          }
        : result;
    }),
  destroy: () => app.destroy(),
});
document
  .querySelector('[data-action="update-one"]')!
  .addEventListener('click', () => fields[0].update((v) => v + 1));
document
  .querySelector('[data-action="update-tenth"]')!
  .addEventListener('click', () => fields[fieldCount - 1].update((v) => v + 1));
const observer = new MutationObserver(() => {
  if (
    probe.bootstrapMs === undefined &&
    document.querySelectorAll('[data-field]').length === fieldCount
  )
    probe.bootstrapMs = performance.now() - started;
});
observer.observe(document.getElementById('mount')!, {
  childList: true,
  subtree: true,
  characterData: true,
});
const started = performance.now();
const app = bootstrapCraft({
  host: document.getElementById('mount')!,
  mode: 'production',
  config: craftAppConfig({ providers: [provideCraftRootComponent(Fields)] }),
});
