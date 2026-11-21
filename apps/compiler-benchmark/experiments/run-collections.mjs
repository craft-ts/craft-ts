import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { cpus } from 'node:os';
import { build, preview } from 'vite';
import { chromium } from '@playwright/test';
import { lab, workspace, baseCommit } from './prepare.mjs';
import { craftCompiler } from '../../../dist/libs/compiler/src/vite.js';

const output = join(lab, process.env.COLLECTION_OUTPUT ?? 'collections');
const app = join(output, 'app');
const modes = (
  process.env.COLLECTION_MODES ??
  'blocks,visibility,table-auto,table-fixed,full,windowed,scheduled'
).split(',');
const runs = Number(process.env.COLLECTION_RUNS ?? 7);
const count = Number(process.env.COLLECTION_ROWS ?? 10000);
const traces = Number(process.env.COLLECTION_TRACES ?? 3);
const check = process.env.COLLECTION_CHECK !== 'false';
await mkdir(app, { recursive: true });
const fixture = await readFile(
  new URL('./collections.fixture.ts', import.meta.url),
  'utf8',
);
const css = await readFile(
  new URL('./collections.css', import.meta.url),
  'utf8',
);
await writeFile(join(app, 'main.ts'), fixture);
const initialSchedulerSource = await readFile(
  new URL('./collections-initial-scheduler.ts', import.meta.url),
  'utf8',
);
await writeFile(
  join(app, 'collections-initial-scheduler.ts'),
  initialSchedulerSource,
);
await writeFile(join(app, 'style.css'), css);
await writeFile(
  join(app, 'index.html'),
  `<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><div id="controls"><button id="pulse">Outside collection</button></div><div id="viewport"><div id="mount"></div></div><script type="module" src="/main.ts"></script></body></html>`,
);
const dist = join(output, 'dist'),
  decisions = [];
const buildStart = performance.now();
await build({
  configFile: false,
  root: app,
  logLevel: 'error',
  plugins: [
    craftCompiler({
      lean: true,
      onReport: (file, components) => decisions.push({ file, components }),
    }),
  ],
  resolve: {
    alias: [
      {
        find: '@craft-ts/component/compiler-runtime',
        replacement: join(workspace, 'libs/component/src/compiler-runtime.ts'),
      },
      ...['core', 'component', 'style'].map((name) => ({
        find: '@craft-ts/' + name,
        replacement: join(workspace, 'libs', name, 'src/index.ts'),
      })),
    ],
  },
  build: { outDir: dist, emptyOutDir: true, minify: 'oxc', target: 'es2022' },
});
const buildMs = performance.now() - buildStart;
const artifacts = [];
for (const name of await readdir(join(dist, 'assets'))) {
  const bytes = await readFile(join(dist, 'assets', name));
  artifacts.push({
    name,
    bytes: bytes.length,
    gzip: gzipSync(bytes).length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
const server = await preview({
  configFile: false,
  root: app,
  logLevel: 'error',
  build: { outDir: dist },
  preview: { host: '127.0.0.1', port: 0 },
});
const url = 'http://127.0.0.1:' + server.httpServer.address().port;
const browser = await chromium.launch({
  headless: true,
  args: [
    '--js-flags=--expose-gc',
    ...(process.env.COLLECTION_AX_FORCE === 'true'
      ? ['--force-renderer-accessibility=complete']
      : []),
  ],
});
const frame = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
const median = (values) => {
  const a = [...values].sort((a, b) => a - b);
  return a.length % 2
    ? a[a.length >> 1]
    : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
async function open(mode, rows, { wait = true, trace = false } = {}) {
  const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    }),
    page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const events = [];
  if (trace) {
    cdp.on('Tracing.dataCollected', (event) => events.push(...event.value));
    await cdp.send('Tracing.start', {
      categories: 'devtools.timeline',
      transferMode: 'ReportEvents',
    });
  }
  await page.goto(url + '/?mode=' + mode + '&rows=' + rows, {
    waitUntil: wait ? 'load' : 'commit',
  });
  if (wait)
    try {
      await page.waitForFunction(
        () => window.__collectionBench?.ready,
        undefined,
        { timeout: 15000 },
      );
    } catch (error) {
      await writeFile(
        join(output, 'open-failure.json'),
        JSON.stringify(
          {
            mode,
            rows,
            errors,
            state: await page.evaluate(() => ({
              bench: window.__collectionBench?.stats?.(),
              ready: window.__collectionBench?.ready,
              rows: document.querySelectorAll('[data-row]').length,
              html: document.getElementById('mount')?.innerHTML.slice(0, 1200),
            })),
          },
          null,
          2,
        ),
      );
      throw error;
    }
  return { context, page, cdp, errors, events };
}
async function close(session) {
  assert.deepEqual(session.errors, []);
  await session.context.close();
}
const snapshot = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-row]')].map((row) => ({
      id: Number(row.getAttribute('data-row')),
      index: Number(row.getAttribute('data-index')),
      label: row.querySelector('.label').textContent,
    })),
  );
const geometry = (page) =>
  page.evaluate(() => ({
    scrollHeight: document.getElementById('viewport').scrollHeight,
    scrollWidth: document.getElementById('viewport').scrollWidth,
    row: document.querySelector('[data-row]').getBoundingClientRect().height,
    columns: [...document.querySelectorAll('thead th')].map(
      (cell) => cell.getBoundingClientRect().width,
    ),
  }));

async function contracts() {
  const result = {},
    snapshots = {};
  for (const mode of modes) {
    const session = await open(mode, 1000),
      { page, cdp } = session;
    const initial = await snapshot(page),
      bounds = await geometry(page);
    assert.equal(
      initial.length,
      mode === 'windowed' ? 28 : 1000,
      mode + ' mounted rows',
    );
    assert.equal(bounds.row, 32, mode + ' row height');
    await page.locator('[data-row="0"] button').click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-row="0"] .label')?.textContent ===
        'Row 0!',
    );
    assert.equal(
      await page.locator('[data-row="0"] .label').textContent(),
      'Row 0!',
      mode + ' Craft button',
    );
    const first = await page.locator('[data-row="0"]').elementHandle();
    if (mode === 'windowed') {
      await page.locator('[data-row="0"] button').focus();
      await page.locator('#viewport').evaluate((element) => {
        element.scrollTop = 500 * 32;
      });
      await page.waitForFunction(
        () => !!document.querySelector('[data-row="500"]'),
      );
      assert(
        await first.evaluate(
          (element) => element === document.querySelector('[data-row="0"]'),
        ),
        mode + ' pinned row identity',
      );
      assert.equal(
        await page.evaluate(() =>
          document.activeElement?.getAttribute('aria-label'),
        ),
        'Edit row 0',
      );
      const visible = await snapshot(page);
      assert(visible.length <= 37, 'bounded window plus pinned focus');
      assert(
        visible.some((row) => row.id === 500 && row.index === 500),
        'global index',
      );
      await page.keyboard.press('Tab');
      session.pinnedNextTab = await page.evaluate(() =>
        document.activeElement?.getAttribute('aria-label'),
      );
      const nextMountedId = Math.min(
        ...visible.filter((row) => row.id !== 0).map((row) => row.id),
      );
      assert.equal(
        session.pinnedNextTab,
        'Edit row ' + nextMountedId,
        'native Tab follows mounted DOM across the gap',
      );
      await page.locator('#pulse').focus();
      await page.waitForFunction(
        () => !document.querySelector('[data-row="0"]'),
      );
      await page.locator('#viewport').evaluate((element) => {
        element.scrollTop = 0;
      });
      await page.waitForFunction(
        () => !!document.querySelector('[data-row="0"]'),
      );
      assert.equal(
        await page.locator('[data-row="0"] .label').textContent(),
        'Row 0!',
      );
    } else {
      await page.evaluate(() => window.__collectionBench.reverse());
      await page.waitForFunction(() => window.__collectionBench.settled());
      await frame(page);
      const reversed = await snapshot(page);
      assert.equal(reversed[0].id, 999, mode + ' reverse');
      assert.equal(reversed[0].index, 0, mode + ' global index after reverse');
      await page.evaluate(() => window.__collectionBench.reverse());
      await page.waitForFunction(() => window.__collectionBench.settled());
      await frame(page);
      const retainedAfterMoves = await first.evaluate(
        (element) => element === document.querySelector('[data-row="0"]'),
      );
      if (mode !== 'blocks' && mode !== 'visibility')
        assert(retainedAfterMoves, mode + ' stable node after moves');
      session.retainedAfterMoves = retainedAfterMoves;
    }
    await page.locator('#pulse').focus();
    // Accessibility queries and forced offscreen focus are diagnostic only.
    await cdp.send('Accessibility.enable');
    await frame(page);
    const { root } = await cdp.send('DOM.getDocument');
    const ax = await cdp.send('Accessibility.queryAXTree', {
      nodeId: root.nodeId,
      accessibleName: 'Edit row 999',
      role: 'button',
    });
    const fullAX = await cdp.send('Accessibility.getFullAXTree');
    const lastAX = fullAX.nodes.filter(
      (node) =>
        node.name?.value === 'Edit row 999' && node.role?.value === 'button',
    );
    const offscreenAccessible = lastAX.some((node) => !node.ignored);
    await writeFile(
      join(output, 'ax-' + mode + '.json'),
      JSON.stringify(
        {
          query: ax,
          fullTreeNodes: fullAX.nodes.length,
          matchingNodes: lastAX,
        },
        null,
        2,
      ),
    );
    if (mode !== 'visibility')
      assert.equal(
        offscreenAccessible,
        mode !== 'windowed',
        mode + ' offscreen AX node',
      );
    if (mode !== 'windowed') {
      await page.locator('[data-row="49"] button').focus();
      await page.keyboard.press('Tab');
      assert.equal(
        await page.evaluate(() =>
          document.activeElement?.getAttribute('aria-label'),
        ),
        'Edit row 50',
        mode + ' keyboard next chunk',
      );
      await page.locator('[data-row="999"] button').focus();
      await frame(page);
      assert.equal(
        await page.evaluate(() =>
          document.activeElement?.getAttribute('aria-label'),
        ),
        'Edit row 999',
      );
    }
    const afterFocus = await geometry(page);
    const axImmediatelyAfterFocus = await cdp.send(
      'Accessibility.getFullAXTree',
    );
    const offscreenAccessibleImmediatelyAfterFocus =
      axImmediatelyAfterFocus.nodes.some(
        (node) =>
          node.role?.value === 'button' &&
          node.name?.value === 'Edit row 999' &&
          !node.ignored,
      );
    const nativeFind = await page.evaluate(() => {
      if (typeof window.find !== 'function') return null;
      window.getSelection()?.removeAllRanges();
      return window.find('Row 999', false, false, true);
    });
    if (nativeFind !== null)
      assert.equal(
        nativeFind,
        mode !== 'windowed',
        mode + ' find in mounted content',
      );
    assert.equal(
      afterFocus.scrollHeight,
      bounds.scrollHeight,
      mode + ' stable height after focus',
    );
    await page.emulateMedia({ media: 'print' });
    await frame(page);
    const printRows = await page.locator('[data-row]').count();
    assert.equal(
      printRows,
      mode === 'windowed' ? 28 : 1000,
      mode + ' print DOM scope',
    );
    await page.emulateMedia({ media: 'screen' });
    const longLabelBefore = await geometry(page);
    if (mode.startsWith('table-')) {
      await page.evaluate(() => window.__collectionBench.setLongLabel());
      await frame(page);
    }
    const longLabelAfter = await geometry(page);
    const axAfterFocus = await cdp.send('Accessibility.getFullAXTree');
    const offscreenAccessibleAfterFocus = axAfterFocus.nodes.some(
      (node) =>
        node.role?.value === 'button' &&
        node.name?.value === 'Edit row 999' &&
        !node.ignored,
    );
    result[mode] = {
      passed: mode !== 'visibility' || offscreenAccessible,
      knownRestriction:
        mode === 'visibility' && !offscreenAccessible
          ? 'Offscreen button absent from CDP accessibility tree until subtree activation'
          : mode === 'windowed'
            ? 'Offscreen rows absent from DOM, AX tree and print; focus pinning is implemented'
            : undefined,
      initialRows: initial.length,
      offscreenAccessible,
      offscreenAccessibleImmediatelyAfterFocus,
      nativeFind,
      pinnedNextTab: session.pinnedNextTab,
      offscreenAccessibleAfterFocus,
      printRows,
      bounds,
      afterFocus,
      longLabelBefore,
      longLabelAfter,
      retainedAfterMoves: session.retainedAfterMoves,
    };
    snapshots[mode] = initial;
    await page.evaluate(() => window.__collectionBench.destroy());
    await frame(page);
    assert.equal(
      await page.locator('[data-row]').count(),
      0,
      mode + ' destroy',
    );
    await close(session);
  }
  for (const [a, b] of [
    ['blocks', 'visibility'],
    ['table-auto', 'table-fixed'],
    ['full', 'scheduled'],
  ])
    if (snapshots[a] && snapshots[b])
      assert.deepEqual(
        snapshots[a],
        snapshots[b],
        a + '/' + b + ' logical content equivalence',
      );
  for (const scheduledMode of modes.filter((mode) =>
    mode.startsWith('scheduled'),
  )) {
    for (const action of ['mutate', 'destroy']) {
      const session = await open(scheduledMode, 5000, { wait: false }),
        { page } = session;
      await page.waitForFunction(() => {
        const n = document.querySelectorAll('[data-row]').length;
        return window.__collectionBench && n > 0 && n < 5000;
      });
      const before = await page.locator('[data-row]').count();
      await page.evaluate((name) => window.__collectionBench[name](), action);
      if (action === 'mutate') {
        await page.waitForFunction(
          () => document.querySelectorAll('[data-row]').length === 2500,
          undefined,
          { timeout: 60000 },
        );
        await frame(page);
        const actual = await snapshot(page);
        assert(actual.every((row) => row.id % 2 === 0));
      } else {
        await frame(page);
        await frame(page);
        assert.equal(await page.locator('[data-row]').count(), 0);
      }
      result[scheduledMode + '-' + action] = {
        passed: true,
        before,
        after: await page.locator('[data-row]').count(),
      };
      await close(session);
    }
  }
  return result;
}

async function measure(job) {
  const session = await open(job.mode, count),
    { page, cdp } = session;
  await frame(page);
  const stats = await page.evaluate(() => window.__collectionBench.stats());
  const metrics = Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map((metric) => [
      metric.name,
      metric.value,
    ]),
  );
  await cdp.send('HeapProfiler.collectGarbage');
  const heapMiB =
    (await cdp.send('Runtime.getHeapUsage')).usedSize / 1024 / 1024;
  const actions = {};
  for (const action of ['update', 'reverse']) {
    const values = [];
    for (let loop = 0; loop < 5; loop++) {
      const value = await page.evaluate(async (name) => {
        const start = performance.now();
        window.__collectionBench[name]();
        await new Promise((resolve) => queueMicrotask(resolve));
        const dispatchMs = performance.now() - start;
        while (!window.__collectionBench.settled())
          await new Promise((resolve) => requestAnimationFrame(resolve));
        return { dispatchMs, settledMs: performance.now() - start };
      }, action);
      await frame(page);
      if (loop >= 2) values.push(value);
    }
    actions[action] = {
      dispatchMs: median(values.map((value) => value.dispatchMs)),
      settledMs: median(values.map((value) => value.settledMs)),
      samples: values,
    };
  }
  if (process.env.COLLECTION_APPEND === 'true') {
    const before = Object.fromEntries(
      (await cdp.send('Performance.getMetrics')).metrics.map((metric) => [
        metric.name,
        metric.value,
      ]),
    );
    const append = await page.evaluate(async () => {
      const probe = window.__collectionBench.longTaskCount();
      const start = performance.now();
      window.__collectionBench.append();
      await new Promise((resolve) => queueMicrotask(resolve));
      const dispatchMs = performance.now() - start;
      while (!window.__collectionBench.settled())
        await new Promise((resolve) => requestAnimationFrame(resolve));
      return { dispatchMs, settledMs: performance.now() - start, probe };
    });
    await frame(page);
    const after = Object.fromEntries(
      (await cdp.send('Performance.getMetrics')).metrics.map((metric) => [
        metric.name,
        metric.value,
      ]),
    );
    const tasks = await page.evaluate(
      (index) => window.__collectionBench.longTasksSince(index),
      append.probe,
    );
    actions.append = {
      dispatchMs: append.dispatchMs,
      settledMs: append.settledMs,
      layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
      maxLongTaskMs: Math.max(0, ...tasks),
    };
    assert.equal(
      await page.locator('[data-row]').count(),
      count + 1000,
      job.mode + ' late append',
    );
  }
  await page.locator('#viewport').evaluate((element) => {
    element.scrollTop = 5000 * 32;
  });
  await frame(page);
  const scrollRowCount = await page.locator('[data-row]').count();
  assert(
    (await page.locator('[data-row="5000"]').count()) > 0 ||
      job.mode !== 'windowed',
  );
  const result = {
    ...job,
    ...stats,
    heapMiB,
    layoutMs: metrics.LayoutDuration * 1000,
    styleMs: metrics.RecalcStyleDuration * 1000,
    scriptMs: metrics.ScriptDuration * 1000,
    actions,
    scrollRowCount,
  };
  await close(session);
  return result;
}
async function trace(job) {
  const session = await open(job.mode, count, { trace: true }),
    { cdp, page } = session;
  await frame(page);
  const done = new Promise((resolve) =>
    cdp.once('Tracing.tracingComplete', resolve),
  );
  await cdp.send('Tracing.end');
  await done;
  const sums = {};
  for (const name of ['Layout', 'Paint', 'UpdateLayoutTree']) {
    const events = session.events.filter(
      (event) => event.name === name && event.ph === 'X',
    );
    sums[name] = {
      ms: events.reduce((sum, event) => sum + (event.dur ?? 0) / 1000, 0),
      events: events.length,
      samples: events.map(({ ts, dur, pid, tid }) => ({ ts, dur, pid, tid })),
    };
  }
  const result = { ...job, ...sums };
  await close(session);
  return result;
}
const librarySha256 = Object.fromEntries(
  await Promise.all(
    [
      'libs/compiler/src/compiler.ts',
      'libs/component/src/lib/for-scheduling.ts',
      'libs/component/src/lib/render/interpreter.ts',
      'libs/component/src/lib/render/compiled-template.ts',
      'libs/core/src/lib/host/craft-signal.ts',
    ].map(async (file) => [
      file,
      createHash('sha256')
        .update(await readFile(join(workspace, file)))
        .digest('hex'),
    ]),
  ),
);
const result = {
  schemaVersion: 1,
  baseCommit,
  sourceCommit: 'cd3d220e9',
  fixture,
  css,
  initialSchedulerSource,
  sourceSha256: createHash('sha256').update(fixture).digest('hex'),
  cssSha256: createHash('sha256').update(css).digest('hex'),
  librarySha256,
  environment: {
    cpu: cpus()[0].model,
    node: process.version,
    chromium: browser.version(),
    forcedAccessibility: process.env.COLLECTION_AX_FORCE === 'true',
  },
  count,
  runs,
  traces,
  build: { buildMs, artifacts, decisions },
  contracts: {},
  raw: [],
  trace: [],
};
try {
  if (check) {
    result.contracts = await contracts();
    console.log(
      'Collection checks completed, restrictions:',
      Object.values(result.contracts).filter((value) => value.knownRestriction)
        .length,
    );
    await writeFile(
      join(output, 'contracts.json'),
      JSON.stringify(result.contracts, null, 2) + '\n',
    );
  }
  const jobs = [];
  for (let run = 0; run < runs; run++)
    for (const mode of modes) jobs.push({ run, mode });
  let seed = 17112026;
  for (let i = jobs.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((seed / 2 ** 32) * (i + 1));
    [jobs[i], jobs[j]] = [jobs[j], jobs[i]];
  }
  for (const job of jobs) {
    result.raw.push(await measure(job));
    console.log(result.raw.length + '/' + jobs.length + ' ' + job.mode);
  }
  // Tracing is deliberately separate from uninstrumented timing samples.
  for (let run = 0; run < traces; run++)
    for (const mode of modes) result.trace.push(await trace({ run, mode }));
  const keys = [
    'bootstrapMs',
    'firstRowsMs',
    'completeMs',
    'firstRowsPaintOpportunityMs',
    'allRowsPaintOpportunityMs',
    'heapMiB',
    'layoutMs',
    'styleMs',
    'maxLongTaskMs',
    'maxTimerLagMs',
    'layoutShift',
    'rowCountingMs',
    'elements',
  ];
  result.summary = modes.map((mode) => {
    const values = result.raw.filter((row) => row.mode === mode);
    return {
      mode,
      ...Object.fromEntries(
        keys.map((key) => [
          key,
          values.length ? median(values.map((value) => value[key])) : null,
        ]),
      ),
      actions: Object.fromEntries(
        [
          'update',
          'reverse',
          ...(process.env.COLLECTION_APPEND === 'true' ? ['append'] : []),
        ].map((key) => [
          key,
          Object.fromEntries(
            ['dispatchMs', 'settledMs'].map((metric) => [
              metric,
              values.length
                ? median(values.map((value) => value.actions[key][metric]))
                : null,
            ]),
          ),
        ]),
      ),
    };
  });
  await writeFile(
    join(output, 'results.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
  console.table(result.summary);
} catch (error) {
  await writeFile(
    join(output, 'failure.json'),
    JSON.stringify(
      { message: error.message, stack: error.stack, result },
      null,
      2,
    ) + '\n',
  );
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
