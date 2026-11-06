export const settings = (() => {
  const p = new URLSearchParams(location.search);
  return {
    rows: Number(p.get('rows') ?? 1000),
    indexes: p.get('indexes') === 'true',
  };
})();
export const initialModel = {
  rows: Array.from({ length: settings.rows }, (_, id) => ({
    id,
    label: `Row ${id}`,
  })),
  filtered: false,
  revision: 0,
};
export const visibleRows = (model) =>
  model.filtered ? model.rows.filter((row) => row.id % 2 === 0) : model.rows;
export function reduce(model, action) {
  let rows = model.rows,
    filtered = model.filtered;
  if (action === 'update-one' || action === 'update-tenth')
    rows = rows.map((row, i) =>
      (action === 'update-one' ? i === 0 : i % 10 === 0)
        ? { ...row, label: row.label + '!' }
        : row,
    );
  else if (action === 'reverse') rows = [...rows].reverse();
  else if (action === 'filter') filtered = !filtered;
  else throw new Error(`Unknown action ${action}`);
  return { rows, filtered, revision: model.revision + 1 };
}
let pending, currentUpdate;
let controlsInstalled = false;
const bench = (window.__bench = {
  bootstrapMs: undefined,
  started: undefined,
  revision: 0,
});
export function begin() {
  bench.started = performance.now();
}
export function installActionHandler(update) {
  currentUpdate = update;
  if (controlsInstalled) return;
  controlsInstalled = true;
  for (const button of document.querySelectorAll('[data-action]'))
    button.addEventListener('click', () => {
      const start = performance.now();
      currentUpdate(button.dataset.action);
      if (pending) pending.dispatchMs = performance.now() - start;
    });
}
const observer = new MutationObserver(() => {
  const rows = document.querySelector('#rows');
  if (!rows) return;
  const revision = Number(rows.dataset.revision);
  if (
    bench.bootstrapMs === undefined &&
    rows.querySelectorAll('[data-row]').length === settings.rows
  )
    bench.bootstrapMs = performance.now() - bench.started;
  if (pending && revision === pending.revision) {
    const { resolve, started, dispatchMs, timeout } = pending;
    pending = undefined;
    clearTimeout(timeout);
    bench.revision = revision;
    resolve({ domMs: performance.now() - started, dispatchMs });
  }
});
observer.observe(document.getElementById('mount'), {
  subtree: true,
  childList: true,
  attributes: true,
  characterData: true,
});
bench.run = (action) =>
  new Promise((resolve, reject) => {
    if (pending) throw new Error('Overlapping benchmark actions');
    const timeout = setTimeout(() => {
      pending = undefined;
      reject(new Error(`Timed out: ${action}`));
    }, 15000);
    pending = {
      resolve,
      started: performance.now(),
      revision: bench.revision + 1,
      timeout,
    };
    document.querySelector(`[data-action="${action}"]`).click();
  });
