// One command after compiler:build: node apps/imperative-render-prototype/run.mjs
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpus } from 'node:os';
import { build, preview } from 'vite';
import { chromium } from '@playwright/test';
import { craftCompiler } from '../../dist/libs/compiler/src/vite.js';
import { prototypeBridge } from './bridge.mjs';

const app = dirname(fileURLToPath(import.meta.url)),
  root = resolve(app, '../..');
const output = resolve(
  root,
  process.env.IMPERATIVE_OUTPUT ?? 'tmp/imperative-render',
);
const runs = Number(process.env.IMPERATIVE_RUNS ?? 7);
const counts = (process.env.IMPERATIVE_ROWS ?? '1000,5000')
  .split(',')
  .map(Number);
const modes = ['runtime', 'lean', 'manual'];
const aliases = [
  {
    find: '@craft-ts/component/compiler-runtime',
    replacement: join(root, 'libs/component/src/compiler-runtime.ts'),
  },
  ...['component', 'core', 'style'].map((name) => ({
    find: '@craft-ts/' + name,
    replacement: join(root, 'libs/' + name + '/src/index.ts'),
  })),
];
const servers = new Map(),
  builds = {};
const median = (values) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
await mkdir(output, { recursive: true });
let browser;
function normalize(html) {
  const source =
    typeof html === 'string'
      ? new DOMParser().parseFromString(html, 'text/html')
      : document;
  const table = source.querySelector('table')?.cloneNode(true);
  if (!table) return '';
  for (const element of [table, ...table.querySelectorAll('*')])
    for (const attr of [...element.attributes])
      if (attr.name.startsWith('data-craft-'))
        element.removeAttribute(attr.name);
  const walker = document.createTreeWalker(table, NodeFilter.SHOW_COMMENT),
    comments = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  for (const comment of comments) comment.remove();
  return table.outerHTML;
}
async function open(mode, count, buttons, instrument = false) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(
    servers.get(mode).url +
      `?rows=${count}&buttons=${buttons}&counts=${instrument}`,
  );
  await page.waitForFunction(() => window.__imperativeBench?.ready, {
    timeout: 30000,
  });
  return { page, context, errors };
}
try {
  for (const mode of modes) {
    const outDir = join(output, mode),
      decisions = [];
    await build({
      root: app,
      configFile: false,
      logLevel: 'error',
      define: { __MODE__: JSON.stringify(mode) },
      resolve: { alias: aliases },
      plugins: [
        prototypeBridge(),
        ...(mode === 'lean'
          ? [
              craftCompiler({
                lean: true,
                onReport: (file, components) =>
                  decisions.push({ file, components }),
              }),
            ]
          : []),
      ],
      build: { outDir, emptyOutDir: true, minify: 'oxc', target: 'es2022' },
    });
    const server = await preview({
      root: app,
      configFile: false,
      logLevel: 'error',
      build: { outDir },
      preview: { host: '127.0.0.1', port: 0 },
    });
    servers.set(mode, {
      server,
      url: `http://127.0.0.1:${server.httpServer.address().port}/`,
    });
    builds[mode] = { decisions };
  }
  // Execute the same fixture in real Node, with no jsdom/window/document.
  assert.equal(typeof document, 'undefined');
  assert.equal(typeof window, 'undefined');
  const ssrDir = join(output, 'ssr');
  await build({
    root: app,
    configFile: false,
    logLevel: 'error',
    resolve: { alias: aliases },
    plugins: [prototypeBridge()],
    build: {
      ssr: join(app, 'server.ts'),
      outDir: ssrDir,
      emptyOutDir: true,
      minify: false,
      rolldownOptions: { output: { entryFileNames: 'server.mjs' } },
    },
  });
  const serverModule = await import(
    pathToFileURL(join(ssrDir, 'server.mjs')).href
  );
  const ssr = [];
  for (const buttons of [false, true]) {
    for (const mode of ['runtime', 'manual']) {
      const result = await serverModule.render(mode, 20, buttons);
      assert.equal((result.html.match(/data-row=/g) ?? []).length, 20);
      assert(result.html.includes('&lt;unsafe &amp; text&gt;'));
      assert(!result.html.includes('<unsafe'));
      if (buttons)
        assert.deepEqual(
          [result.lifecycle.mounted, result.lifecycle.destroyed],
          [20, 20],
        );
      ssr.push({ mode, buttons, ...result });
    }
  }
  browser = await chromium.launch({ headless: true });
  const comparisonPage = await browser.newPage();
  for (const buttons of [false, true]) {
    const pair = ssr.filter((item) => item.buttons === buttons);
    assert.equal(
      await comparisonPage.evaluate(normalize, pair[0].html),
      await comparisonPage.evaluate(normalize, pair[1].html),
      'SSR DOM equivalence',
    );
  }
  await comparisonPage.close();
  const concurrentSsr = await Promise.all([
    serverModule.render('manual', 7, true),
    serverModule.render('manual', 9, true),
  ]);
  assert.deepEqual(
    concurrentSsr.map((item) => (item.html.match(/data-row=/g) ?? []).length),
    [7, 9],
  );
  assert.deepEqual(
    concurrentSsr.map((item) => item.lifecycle.destroyed),
    [7, 9],
  );
  const contracts = [];
  for (const buttons of [false, true]) {
    const traces = [];
    for (const mode of modes) {
      const { page, context, errors } = await open(mode, 40, buttons, true);
      const trace = [await page.evaluate(normalize)];
      await page.evaluate(() => {
        window.__retained = document.querySelector('[data-row="0"]');
        window.__oldButton = document.querySelector('[data-edit="0"]');
      });
      for (const action of ['one', 'reverse', 'filter', 'restore', 'insert']) {
        await page.evaluate((a) => window.__imperativeBench.run(a), action);
        trace.push(await page.evaluate(normalize));
        assert(
          await page.evaluate(
            () =>
              document.querySelector('[data-row="0"]') === window.__retained,
          ),
          mode + ' row identity',
        );
        if (action === 'reverse' && buttons) {
          await page.locator('[data-edit="39"]').click();
          await page.evaluate(
            () => new Promise((resolve) => queueMicrotask(resolve)),
          );
          assert.deepEqual(
            await page.evaluate(
              () => window.__imperativeBench.lifecycle.clicks,
            ),
            [39],
          );
          trace.push(await page.evaluate(normalize));
        }
      }
      await page.evaluate(() => window.__imperativeBench.run('destroy'));
      assert.equal(await page.locator('#mount').textContent(), '');
      if (buttons) {
        const before = await page.evaluate(() => ({
          ...window.__imperativeBench.lifecycle,
        }));
        assert.equal(before.mounted, before.destroyed);
        await page.evaluate(() => window.__oldButton.click());
        assert.deepEqual(
          await page.evaluate(() => window.__imperativeBench.lifecycle.clicks),
          before.clicks,
        );
      }
      assert.deepEqual(errors, []);
      traces.push({ mode, trace });
      await context.close();
    }
    for (const item of traces.slice(1))
      assert.deepEqual(
        item.trace,
        traces[0].trace,
        `${item.mode} DOM equivalence`,
      );
    contracts.push({ buttons, steps: traces[0].trace.length, passed: true });
  }
  const jobs = [];
  for (let run = 0; run < runs; run++)
    for (const count of counts)
      for (const buttons of [false, true])
        for (const mode of modes) jobs.push({ run, count, buttons, mode });
  let seed = 17112026;
  for (let i = jobs.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((seed / 2 ** 32) * (i + 1));
    [jobs[i], jobs[j]] = [jobs[j], jobs[i]];
  }
  const raw = [];
  for (const job of jobs) {
    const { page, context, errors } = await open(
      job.mode,
      job.count,
      job.buttons,
    );
    const result = await page.evaluate(() => ({
      mount: window.__imperativeBench.mount,
      layout: window.__imperativeBench.layout,
      frame: window.__imperativeBench.frame,
      nodes: document.querySelector('#mount').querySelectorAll('*').length,
    }));
    result.mountAndLayout = result.mount + result.layout;
    const samples = {};
    for (let loop = 0; loop < 7; loop++)
      for (const action of [
        'one',
        'tenth',
        'reverse',
        'reverse',
        'filter',
        'restore',
      ]) {
        const ms = await page.evaluate(
          (a) => window.__imperativeBench.run(a),
          action,
        );
        if (loop >= 2) (samples[action] ??= []).push(ms);
      }
    result.actions = Object.fromEntries(
      Object.entries(samples).map(([k, v]) => [k, median(v)]),
    );
    const cdp = await context.newCDPSession(page);
    await cdp.send('HeapProfiler.collectGarbage');
    result.heapMiB =
      (await cdp.send('Runtime.getHeapUsage')).usedSize / 1024 / 1024;
    result.destroy = await page.evaluate(() =>
      window.__imperativeBench.run('destroy'),
    );
    assert.deepEqual(errors, []);
    raw.push({ ...job, ...result });
    await context.close();
    if (raw.length % 10 === 0)
      console.log(`${raw.length}/${jobs.length} navigations`);
  }
  const summary = [];
  for (const count of counts)
    for (const buttons of [false, true])
      for (const mode of modes) {
        const items = raw.filter(
          (r) => r.count === count && r.buttons === buttons && r.mode === mode,
        );
        const distribution = (values) => ({
          median: median(values),
          min: Math.min(...values),
          max: Math.max(...values),
          samples: values,
        });
        summary.push({
          count,
          buttons,
          mode,
          ...Object.fromEntries(
            [
              'mount',
              'layout',
              'mountAndLayout',
              'frame',
              'heapMiB',
              'destroy',
            ].map((k) => [k, distribution(items.map((r) => r[k]))]),
          ),
          actions: Object.fromEntries(
            Object.keys(items[0].actions).map((k) => [
              k,
              distribution(items.map((r) => r.actions[k])),
            ]),
          ),
        });
      }
  const files = ['fixture.ts', 'main.ts', 'bridge.mjs', 'run.mjs', 'server.ts'];
  const hashes = Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        file,
        createHash('sha256')
          .update(await readFile(join(app, file)))
          .digest('hex'),
      ]),
    ),
  );
  const report = {
    timestamp: new Date().toISOString(),
    base: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    environment: {
      cpu: cpus()[0].model,
      node: process.version,
      chromium: browser.version(),
    },
    runs,
    iterations: 5,
    sourceSha256: hashes,
    builds,
    contracts,
    ssr,
    concurrentSsr: { counts: [7, 9], passed: true },
    summary,
    raw,
  };
  await writeFile(
    join(output, 'results.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.table(
    summary.map((r) => ({
      rows: r.count,
      buttons: r.buttons,
      mode: r.mode,
      mount: r.mount.median,
      layout: r.layout.median,
      heap: r.heapMiB.median,
      one: r.actions.one.median,
      restore: r.actions.restore.median,
    })),
  );
  console.log(join(output, 'results.json'));
} finally {
  await browser?.close();
  for (const { server } of servers.values())
    await new Promise((resolve) => server.httpServer.close(resolve));
}
