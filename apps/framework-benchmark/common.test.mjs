import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM(
  `
  <button data-action="update-one"></button>
  <div id="mount"><div id="rows" data-revision="0"></div></div>
`,
  { url: 'https://benchmark.test/?rows=20&indexes=true' },
);
const globals = {
  window: dom.window,
  document: dom.window.document,
  location: dom.window.location,
  MutationObserver: dom.window.MutationObserver,
};
const previous = new Map(
  Object.keys(globals).map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]),
);
Object.assign(globalThis, globals);
after(() => {
  dom.window.close();
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});
const {
  settings,
  initialModel,
  visibleRows,
  reduce,
  begin,
  installActionHandler,
} = await import('./src/common.js');

test('all framework variants receive the same URL-sized initial fixture', () => {
  assert.deepEqual(settings, { rows: 20, indexes: true });
  assert.equal(initialModel.rows.length, 20);
  assert.deepEqual(initialModel.rows[0], { id: 0, label: 'Row 0' });
  assert.deepEqual(initialModel.rows[19], { id: 19, label: 'Row 19' });
  assert.equal(visibleRows(initialModel), initialModel.rows);
});

test('updates change the intended rows and retain every untouched identity', () => {
  const one = reduce(initialModel, 'update-one');
  assert.equal(one.revision, 1);
  assert.equal(one.rows[0].label, 'Row 0!');
  assert.notEqual(one.rows[0], initialModel.rows[0]);
  assert.equal(initialModel.rows[0].label, 'Row 0');
  for (let i = 1; i < one.rows.length; i++)
    assert.equal(one.rows[i], initialModel.rows[i]);

  const tenth = reduce(initialModel, 'update-tenth');
  assert.deepEqual(
    tenth.rows
      .filter((row, i) => row !== initialModel.rows[i])
      .map((row) => row.id),
    [0, 10],
  );
  assert.deepEqual(
    tenth.rows.filter((row) => row.label.endsWith('!')).map((row) => row.id),
    [0, 10],
  );
});

test('reverse and filter preserve stable row keys and do not mutate the fixture', () => {
  const reversed = reduce(initialModel, 'reverse');
  assert.deepEqual(
    reversed.rows.map((row) => row.id),
    Array.from({ length: 20 }, (_, i) => 19 - i),
  );
  assert.equal(reversed.rows[0], initialModel.rows[19]);
  const filtered = reduce(reversed, 'filter');
  assert.deepEqual(
    visibleRows(filtered).map((row) => row.id),
    [18, 16, 14, 12, 10, 8, 6, 4, 2, 0],
  );
  assert.equal(visibleRows(reduce(filtered, 'filter')), reversed.rows);
  assert.equal(initialModel.rows[0].id, 0);
  assert.throws(() => reduce(initialModel, 'unknown'), /Unknown action/);
});

test('the timing harness observes the initial mount and resolves only a committed revision', async () => {
  const bench = window.__bench;
  const rows = document.querySelector('#rows');
  const paint = (model) => {
    rows.replaceChildren(
      ...visibleRows(model).map((row) => {
        const element = document.createElement('div');
        element.dataset.row = String(row.id);
        element.textContent = row.label;
        return element;
      }),
    );
    rows.dataset.revision = String(model.revision);
  };
  let model = initialModel;
  begin();
  paint(model);
  await new Promise((resolve) => queueMicrotask(resolve));
  assert.ok(Number.isFinite(bench.bootstrapMs));

  // The latest handler replaces the old one without a second listener.
  installActionHandler(() => assert.fail('A stale handler must not run'));
  installActionHandler((action) => {
    model = reduce(model, action);
    paint(model);
  });
  const timing = await bench.run('update-one');
  assert.equal(bench.revision, 1);
  assert.equal(rows.dataset.revision, '1');
  assert.equal(rows.firstElementChild.textContent, 'Row 0!');
  assert.ok(timing.dispatchMs >= 0);
  assert.ok(timing.domMs >= timing.dispatchMs);
});
