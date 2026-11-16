#!/usr/bin/env node
// Performance lab for the "page" fixture: one realistic admin page (about
// 1 700 component instances at scale 1) written twice, in craft-ts and in
// SolidJS, with the same DOM, the same components and the same reducer.
//
// It first proves the two pages are the same page (normalized DOM compared
// after mount and after every action, and component instances compared per
// component type), and only then measures.
//
//   PAGE_VARIANTS="craft=craft-page,solid=solid-page"   label=entry[@libsRoot]
//   PAGE_VARIANTS="ref=craft-page@/path/to/other/root,craft=craft-page,solid=solid-page"
//   PAGE_SCALES=1,2          content scale (1, 2 or 4)
//   PAGE_RUNS=7              navigations per variant and scale
//   PAGE_ITERATIONS=6        measured loops per navigation (after 2 warm-up loops)
//   PAGE_CHECK=true|false|only   equivalence check before measuring (only = no timings)
//   PAGE_COUNT=true|false    component instance counting (instrumented build)
//   PAGE_CPU=1               CPU throttling rate
//   PAGE_COMPILER_LABELS=compiled  optional compiler labels (PAGE_COUNT=false)
//   PAGE_OUTPUT=tmp/perf-lab/page
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';
import { componentCounter } from './page-count.plugin.mjs';

const app = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(app, '../..');
const output = resolve(workspace, process.env.PAGE_OUTPUT ?? 'tmp/perf-lab/page');
const variants = (
  process.env.PAGE_VARIANTS ?? 'craft=craft-page,solid=solid-page'
)
  .split(',')
  .map((spec) => {
    const [left, root] = spec.split('@');
    const [label, entry] = left.includes('=') ? left.split('=') : [left, left];
    return { label, entry, root: root ? resolve(root) : workspace };
  });
const scales = (process.env.PAGE_SCALES ?? '1,2').split(',').map(Number);
const runs = Number(process.env.PAGE_RUNS ?? 7);
const iterations = Number(process.env.PAGE_ITERATIONS ?? 6);
const warmup = 2;
const throttle = Number(process.env.PAGE_CPU ?? 1);
const checkMode = process.env.PAGE_CHECK ?? 'true';
const countMode = (process.env.PAGE_COUNT ?? 'true') === 'true';
const compilerLabels = new Set((process.env.PAGE_COMPILER_LABELS ?? '').split(',').filter(Boolean));
if (compilerLabels.size && countMode) throw new Error('Use PAGE_COUNT=false: instance-counting wrappers disable compiled rendering.');
const columns = [
  'mount',
  'toggle-one',
  'counter',
  'filter',
  'unfilter',
  'sort',
  'tab',
  'tab-back',
  'theme',
  'remount',
];

await mkdir(output, { recursive: true });
const configFile = join(app, 'vite.config.mjs');

async function buildVariant(variant, { minify, count }) {
  const compilation = [];
  const compiler = compilerLabels.has(variant.label)
    ? (await import('../../dist/libs/compiler/src/vite.js')).craftCompiler({
        onReport: (file, components) => compilation.push({ file, components }),
      })
    : undefined;
  const dist = join(
    output,
    'dist',
    variant.label + (count ? '-count' : minify ? '' : '-plain'),
  );
  await build({
    configFile,
    logLevel: 'error',
    plugins: [...(compiler ? [compiler] : []), ...(count ? [componentCounter()] : [])],
    resolve: {
      alias: [
        { find: '@craft-ts/component/compiler-runtime', replacement: join(variant.root, 'libs/component/src/compiler-runtime.ts') },
        ...['core', 'component', 'style'].map(name => ({
          find: '@craft-ts/' + name, replacement: join(variant.root, 'libs/' + name + '/src/index.ts'),
        })),
      ],
    },
    build: {
      outDir: dist,
      emptyOutDir: true,
      minify: minify ? 'oxc' : false,
      rolldownOptions: {
        input: { [variant.entry]: join(app, variant.entry, 'index.html') },
      },
    },
  });
  if (compiler) await writeFile(join(output, variant.label + (minify ? '' : '-plain') + '-compiler.json'), JSON.stringify(compilation, null, 2) + '\n');
  const server = await preview({
    configFile,
    logLevel: 'error',
    build: { outDir: dist },
  });
  return {
    url: `http://127.0.0.1:${server.httpServer.address().port}/${variant.entry}/`,
    close: () => new Promise((done) => server.httpServer.close(done)),
  };
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
const frames = (page) =>
  page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      ),
  );

async function open(browser, url, scale) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const cdp = await context.newCDPSession(page);
  if (throttle > 1)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  return {
    context,
    page,
    cdp,
    errors,
    go: async () => {
      await page.goto(`${url}?scale=${scale}`);
      await page.waitForFunction(
        () => Number.isFinite(window.__bench?.bootstrapMs),
        undefined,
        { timeout: 30000 },
      );
    },
  };
}

const heap = async (cdp) => {
  await cdp.send('HeapProfiler.collectGarbage');
  return (await cdp.send('Runtime.getHeapUsage')).usedSize / 1024 / 1024;
};

// -- Timing -------------------------------------------------------------------

async function measure(browser, url, scale) {
  const session = await open(browser, url, scale);
  const { page, cdp } = session;
  await session.go();
  await frames(page);
  const mount = await page.evaluate(() => window.__bench.bootstrapMs);
  const nodes = await page.evaluate(() => window.__bench.mountNodes);
  const heapMount = await heap(cdp);
  const samples = Object.fromEntries(columns.map((name) => [name, []]));
  const run = async (action, into, record) => {
    const { domMs } = await page.evaluate(
      (name) => window.__bench.run(name),
      action,
    );
    if (record) samples[into].push(domMs);
    await frames(page);
  };
  for (let index = 0; index < warmup + iterations; index++) {
    const record = index >= warmup;
    await run('toggle-one', 'toggle-one', record);
    await run('counter', 'counter', record);
    await run('filter', 'filter', record);
    await run('filter', 'unfilter', record);
    await run('sort', 'sort', record);
    await run('sort', 'sort', record);
    await run('tab', 'tab', record);
    await run('tab', 'tab-back', record);
    await run('theme', 'theme', record);
    await run('theme', 'theme', record);
    await run('remount', 'remount', record);
  }
  const result = { mount, nodes, heapMountMiB: heapMount };
  for (const name of columns.slice(1)) result[name] = median(samples[name]);
  result.heapMiB = await heap(cdp);
  assert.deepEqual(session.errors, []);
  await session.context.close();
  return result;
}

// -- Equivalence --------------------------------------------------------------

const BENCH_STEPS = [
  'toggle-one', 'counter', 'filter', 'filter', 'sort', 'sort', 'tab', 'tab',
  'theme', 'theme', 'toggle-menu', 'toggle-menu', 'read-all', 'density',
  'density', 'noop',
];
const UI_STEPS = [
  ['chip pending', (p) => p.click('.chip >> nth=2')],
  ['chip all', (p) => p.click('.chip >> nth=0')],
  ['sort score', (p) => p.click('.sort-header >> nth=3 >> button')],
  ['sort score again', (p) => p.click('.sort-header >> nth=3 >> button')],
  ['sort joined', (p) => p.click('.sort-header >> nth=4 >> button')],
  ['star row 1', (p) => p.click('tbody tr >> nth=0 >> .cell--actions button >> nth=1')],
  ['view row 3', (p) => p.click('tbody tr >> nth=2 >> .cell--actions button >> nth=0')],
  ['flag row 2', (p) => p.click('tbody tr >> nth=1 >> .cell--actions button >> nth=2')],
  ['view row 3 again', (p) => p.click('tbody tr >> nth=2 >> .cell--actions button >> nth=0')],
  ['search type', (p) => p.fill('.search__input', 'ada')],
  ['search clear', (p) => p.click('.search .icon-btn')],
  ['menu open', (p) => p.click('.user-menu__toggle')],
  ['menu close', (p) => p.click('.user-menu__toggle')],
  ['density button', (p) => p.click('.toolbar__group >> nth=1 >> .btn >> nth=1')],
  ['reset button', (p) => p.click('.toolbar__group >> nth=1 >> .btn >> nth=0')],
  ['bell', (p) => p.click('.bell')],
  ['like card', (p) => p.click('.card >> nth=0 >> .card__actions .btn >> nth=0')],
  ['pin card', (p) => p.click('.card >> nth=1 >> .card__actions .btn >> nth=1')],
  ['unpin card', (p) => p.click('.card >> nth=1 >> .card__actions .btn >> nth=1')],
  ['check task', (p) => p.click('.card >> nth=2 >> .task-toggle input')],
  ['tab notes', (p) => p.click('.tab >> nth=2')],
  ['tab files', (p) => p.click('.tab >> nth=1')],
  ['tab board', (p) => p.click('.tab >> nth=0')],
  ['edit text', (p) => p.fill('.form-field >> nth=1 >> input', 'Hopper')],
  ['edit textarea', (p) => p.fill('.form-field >> nth=4 >> textarea', 'A few words')],
  ['edit select', (p) => p.selectOption('.form-field >> nth=7 >> select', 'Design')],
  ['toggle checkbox', (p) => p.click('.control--check')],
  ['clear required', (p) => p.fill('.form-field >> nth=0 >> input', '')],
];

async function trace(browser, url, scale) {
  const session = await open(browser, url, scale);
  const { page } = session;
  await session.go();
  await frames(page);
  const entries = [];
  const snapshot = async (step, extra = {}) =>
    entries.push({
      step,
      html: await page.evaluate(() => window.__bench.snapshot()),
      ...extra,
    });
  await snapshot('mount');
  // Instances created by the first mount, before any action (the counters are cumulative).
  const counts = countMode
    ? await page.evaluate(() => ({ ...globalThis.__components }))
    : undefined;
  // craft-ts mounts the root component from bootstrapCraft, not by calling the
  // wrapped component function: the instrumentation misses exactly that one.
  if (counts) counts.App ??= 1;
  const runBench = async (action) => {
    const { nodes } = await page.evaluate(
      (name) => window.__bench.run(name),
      action,
    );
    await frames(page);
    const settled = await page.evaluate(
      () => document.getElementById('mount').querySelectorAll('*').length,
    );
    // The revision marker must not be published before the DOM is final.
    assert.equal(
      nodes,
      settled,
      `${action}: ${nodes} nodes when the clock stopped, ${settled} two frames later`,
    );
    await snapshot(`bench:${action}`);
  };
  for (const action of BENCH_STEPS) await runBench(action);
  await runBench('remount');
  for (const [name, act] of UI_STEPS) {
    await act(page);
    await frames(page);
    await snapshot(`ui:${name}`);
  }
  await runBench('remount');
  assert.deepEqual(session.errors, []);
  await session.context.close();
  return { entries, counts };
}

function firstDifference(left, right) {
  const a = left.split('\n');
  const b = right.split('\n');
  const length = Math.min(a.length, b.length);
  let index = 0;
  while (index < length && a[index] === b[index]) index++;
  const around = (lines) => lines.slice(Math.max(0, index - 3), index + 4).join('\n');
  return `line ${index} (${a.length} vs ${b.length} lines)\n--- first\n${around(a)}\n--- second\n${around(b)}`;
}

async function equivalence(browser, servers, countServers) {
  const report = {};
  for (const scale of scales) {
    const traces = new Map();
    for (const variant of variants)
      traces.set(
        variant.label,
        await trace(browser, (countMode ? countServers : servers).get(variant.label), scale),
      );
    const [reference, ...others] = [...traces];
    const [referenceLabel, referenceTrace] = reference;
    const steps = referenceTrace.entries.length;
    for (const [label, other] of others) {
      assert.equal(other.entries.length, steps, `${label}: number of steps`);
      referenceTrace.entries.forEach((entry, index) => {
        const candidate = other.entries[index];
        if (entry.html !== candidate.html)
          assert.fail(
            `DOM differs after "${entry.step}" at scale ${scale}: ${referenceLabel} vs ${label}, first difference at ${firstDifference(entry.html, candidate.html)}`,
          );
      });
      if (countMode)
        assert.deepEqual(
          other.counts,
          referenceTrace.counts,
          `${label}: component instances per type differ from ${referenceLabel}`,
        );
    }
    const mountHtml = referenceTrace.entries[0].html;
    report[scale] = {
      steps,
      domNodes: (mountHtml.match(/^<[a-z]/gm) ?? []).length,
      instances: referenceTrace.counts
        ? Object.values(referenceTrace.counts).reduce((a, b) => a + b, 0)
        : undefined,
      types: referenceTrace.counts ? Object.keys(referenceTrace.counts).length : undefined,
      counts: referenceTrace.counts,
    };
    console.log(
      `scale ${scale}: ${variants.length} variants identical over ${steps} snapshots` +
        (report[scale].instances === undefined
          ? ''
          : `; ${report[scale].instances} component instances of ${report[scale].types} types, per type identical`),
    );
  }
  return report;
}

// -- Main ---------------------------------------------------------------------

const browser = await chromium.launch({
  headless: true,
  args: ['--js-flags=--expose-gc'],
});
const servers = [];
const result = {};
try {
  const countServers = new Map();
  if (checkMode !== 'false') {
    const plain = new Map();
    for (const variant of variants) {
      const server = await buildVariant(variant, { minify: false, count: countMode });
      servers.push(server);
      (countMode ? countServers : plain).set(variant.label, server.url);
    }
    result.equivalence = await equivalence(browser, plain, countServers);
  }
  if (checkMode !== 'only') {
    const urls = new Map();
    for (const variant of variants) {
      const server = await buildVariant(variant, { minify: true, count: false });
      servers.push(server);
      urls.set(variant.label, server.url);
    }
    result.cases = [];
    for (const scale of scales) {
      const samples = new Map(variants.map((variant) => [variant.label, []]));
      for (let run = 0; run < runs; run++) {
        const order = [...variants].sort(() => Math.random() - 0.5);
        for (const variant of order)
          samples
            .get(variant.label)
            .push(await measure(browser, urls.get(variant.label), scale));
      }
      const keys = [...columns, 'heapMountMiB', 'heapMiB', 'nodes'];
      const table = {};
      for (const [label, values] of samples)
        table[label] = Object.fromEntries(
          keys.map((key) => [
            key,
            Number(median(values.map((value) => value[key])).toFixed(2)),
          ]),
        );
      result.cases.push({ scale, table, samples: Object.fromEntries(samples) });
      console.log(`\nscale ${scale}, ${runs} runs, ${iterations} loops each, CPU x${throttle}`);
      console.table(table);
    }
  }
  await writeFile(join(output, 'report.json'), JSON.stringify(result, null, 2) + '\n');
} finally {
  await browser.close();
  for (const server of servers) await server.close();
}
