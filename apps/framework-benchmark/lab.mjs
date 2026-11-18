#!/usr/bin/env node
// Performance lab: a fast loop to compare entries (and runtimes) of this
// benchmark, and to profile one of them. It complements the campaign runners
// (run.mjs, runtime-only.mjs): fewer guarantees, much shorter turnaround.
//
//   LAB_VARIANTS="craft,solid,vanilla"            entries of this folder
//   LAB_VARIANTS="ref=craft@/path/to/other/root"  same entry, other libs root
//   LAB_CASES='[{"rows":1000,"indexes":false}]'
//   LAB_RUNS=5 LAB_ITERATIONS=6
//   LAB_PROFILE=craft        CPU profile of that variant's mount (unminified)
//   LAB_ALLOCATIONS=true     with LAB_PROFILE: sampled allocations per row instead
//   LAB_OUTPUT=tmp/perf-lab/<name>
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';

const app = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(app, '../..');
const output = resolve(
  workspace,
  process.env.LAB_OUTPUT ?? 'tmp/perf-lab/latest',
);
const variants = (process.env.LAB_VARIANTS ?? 'craft,solid,vanilla')
  .split(',')
  .map((spec) => {
    const [left, root] = spec.split('@');
    const [label, entry] = left.includes('=') ? left.split('=') : [left, left];
    return { label, entry, root: root ? resolve(root) : workspace };
  });
const cases = JSON.parse(
  process.env.LAB_CASES ??
    JSON.stringify([
      { rows: 1000, indexes: false },
      { rows: 1000, indexes: true },
    ]),
);
const runs = Number(process.env.LAB_RUNS ?? 5);
const iterations = Number(process.env.LAB_ITERATIONS ?? 6);
const warmup = 2;
const profiled = process.env.LAB_PROFILE;
const throttle = Number(process.env.LAB_CPU ?? 1);
const actions = ['update-one', 'update-tenth', 'reverse'];

await mkdir(output, { recursive: true });
const configFile = join(app, 'vite.config.mjs');
async function buildVariant(variant, { minify }) {
  const dist = join(output, 'dist', variant.label + (minify ? '' : '-plain'));
  await build({
    configFile,
    logLevel: 'error',
    resolve: {
      alias: {
        '@craft-ts/core': join(variant.root, 'libs/core/src/index.ts'),
        '@craft-ts/component': join(
          variant.root,
          'libs/component/src/index.ts',
        ),
        '@craft-ts/style': join(variant.root, 'libs/style/src/index.ts'),
      },
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
async function open(browser, url, scenario) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  if (throttle > 1)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  return {
    context,
    page,
    cdp,
    errors,
    go: async () => {
      await page.goto(
        `${url}?rows=${scenario.rows}&indexes=${scenario.indexes}`,
      );
      await page.waitForFunction(
        () => Number.isFinite(window.__bench?.bootstrapMs),
        undefined,
        { timeout: 30000 },
      );
    },
  };
}
async function check(page, scenario, expectedCount) {
  const result = await page.evaluate(
    ({ indexes }) => {
      const nodes = [...document.querySelectorAll('#rows [data-row]')];
      return {
        count: nodes.length,
        positions:
          !indexes ||
          nodes.every(
            (node, index) =>
              node.querySelector('[data-position]')?.dataset.position ===
                String(index) && node.textContent.startsWith(`${index + 1}. `),
          ),
      };
    },
    { indexes: scenario.indexes },
  );
  assert.equal(result.count, expectedCount, 'row count');
  assert(result.positions, 'positions');
}
async function measure(browser, url, scenario) {
  const session = await open(browser, url, scenario);
  const { page, cdp } = session;
  await session.go();
  const result = { mount: await page.evaluate(() => window.__bench.bootstrapMs) };
  await check(page, scenario, scenario.rows);
  await frames(page);
  for (const action of actions) {
    const samples = [];
    for (let index = 0; index < warmup + iterations; index++) {
      const { domMs } = await page.evaluate(
        (name) => window.__bench.run(name),
        action,
      );
      if (index >= warmup) samples.push(domMs);
      await frames(page);
    }
    result[action] = median(samples);
  }
  const filter = [];
  const restore = [];
  for (let index = 0; index < warmup + iterations; index++) {
    const out = await page.evaluate(() => window.__bench.run('filter'));
    await check(page, scenario, Math.ceil(scenario.rows / 2));
    await frames(page);
    const back = await page.evaluate(() => window.__bench.run('filter'));
    await check(page, scenario, scenario.rows);
    await frames(page);
    if (index >= warmup) {
      filter.push(out.domMs);
      restore.push(back.domMs);
    }
  }
  result.filter = median(filter);
  result.restore = median(restore);
  await cdp.send('HeapProfiler.collectGarbage');
  result.heapMiB =
    (await cdp.send('Runtime.getHeapUsage')).usedSize / 1024 / 1024;
  assert.deepEqual(session.errors, []);
  await session.context.close();
  return result;
}
async function profile(browser, url, scenario, label) {
  const self = new Map();
  const inclusive = new Map();
  let total = 0;
  for (let run = 0; run < 3; run++) {
    const session = await open(browser, url, scenario);
    const { cdp } = session;
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 50 });
    // LAB_PROFILE_ACTION=filter profiles six runs of that action instead of
    // the mount ("filter" alternates removal and restoration).
    const action = process.env.LAB_PROFILE_ACTION;
    if (action) {
      await session.go();
      for (let index = 0; index < 2; index++) {
        await session.page.evaluate((name) => window.__bench.run(name), action);
        await frames(session.page);
      }
    }
    await cdp.send('Profiler.start');
    if (action) {
      for (let index = 0; index < 6; index++) {
        await session.page.evaluate((name) => window.__bench.run(name), action);
        await frames(session.page);
      }
    } else await session.go();
    const { profile: data } = await cdp.send('Profiler.stop');
    assert.deepEqual(session.errors, []);
    await session.context.close();
    if (run === 0)
      await writeFile(
        join(output, `${label}-${scenario.rows}.cpuprofile`),
        JSON.stringify(data),
      );
    const byId = new Map(data.nodes.map((node) => [node.id, node]));
    const parent = new Map();
    for (const node of data.nodes)
      for (const child of node.children ?? []) parent.set(child, node.id);
    const name = (node) =>
      `${node.callFrame.functionName || '(anonymous)'} ${node.callFrame.url.split('/').pop()}:${node.callFrame.lineNumber + 1}`;
    data.samples.forEach((id, index) => {
      const ms = data.timeDeltas[index] / 1000;
      const node = byId.get(id);
      if (['(idle)', '(program)'].includes(node.callFrame.functionName)) return;
      total += ms;
      self.set(name(node), (self.get(name(node)) ?? 0) + ms);
      const seen = new Set();
      for (let at = id; at !== undefined; at = parent.get(at)) {
        const key = name(byId.get(at));
        if (seen.has(key)) continue;
        seen.add(key);
        inclusive.set(key, (inclusive.get(key) ?? 0) + ms);
      }
    });
  }
  const top = (map, count) =>
    [...map]
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([key, ms]) => `${(ms / 3).toFixed(1).padStart(7)} ms  ${key}`);
  const text = [
    `# ${label}, ${scenario.rows} rows, indexes=${scenario.indexes}, CPU x${throttle}`,
    `total sampled: ${(total / 3).toFixed(1)} ms per navigation (module load included)`,
    '',
    '## self',
    ...top(self, 70),
    '',
    '## inclusive',
    ...top(inclusive, 90),
  ].join('\n');
  await writeFile(join(output, `${label}-${scenario.rows}-profile.txt`), text);
  console.log(text);
}

async function allocations(browser, url, scenario, label) {
  const session = await open(browser, url, scenario);
  const { cdp } = session;
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.startSampling', {
    samplingInterval: 512,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });
  await session.go();
  const { profile: data } = await cdp.send('HeapProfiler.stopSampling');
  assert.deepEqual(session.errors, []);
  await session.context.close();
  const self = new Map();
  let total = 0;
  const label_ = (frame) =>
    `${frame.functionName || '(anonymous)'} ${frame.url.split('/').pop()}:${frame.lineNumber + 1}`;
  // A native frame (Set, push, bind…) is charged to the script frame calling it.
  const visit = (node, caller) => {
    const frame = node.callFrame;
    const native = frame.url === '';
    const key = native && caller ? `${frame.functionName} <- ${caller}` : label_(frame);
    self.set(key, (self.get(key) ?? 0) + node.selfSize);
    total += node.selfSize;
    for (const child of node.children ?? [])
      visit(child, native ? caller : label_(frame));
  };
  visit(data.head, undefined);
  const text = [
    `# allocations of ${label}, ${scenario.rows} rows, indexes=${scenario.indexes}`,
    `total sampled: ${(total / 1024 / 1024).toFixed(2)} MiB, ${(total / scenario.rows).toFixed(0)} bytes per row (module load included)`,
    '',
    ...[...self]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 60)
      .map(
        ([key, bytes]) =>
          `${(bytes / scenario.rows).toFixed(0).padStart(7)} B/row  ${key}`,
      ),
  ].join('\n');
  await writeFile(join(output, `${label}-${scenario.rows}-allocations.txt`), text);
  console.log(text);
}

const browser = await chromium.launch({
  headless: true,
  args: ['--js-flags=--expose-gc'],
});
const report = { cases: [] };
const servers = [];
try {
  if (profiled) {
    const variant = variants.find((entry) => entry.label === profiled);
    assert(variant, `Unknown variant ${profiled}`);
    const server = await buildVariant(variant, { minify: false });
    servers.push(server);
    for (const scenario of cases) {
      if (process.env.LAB_ALLOCATIONS === 'true')
        await allocations(browser, server.url, scenario, variant.label);
      else await profile(browser, server.url, scenario, variant.label);
    }
  } else {
    for (const variant of variants) {
      const server = await buildVariant(variant, { minify: true });
      servers.push(server);
      variant.url = server.url;
    }
    for (const scenario of cases) {
      const samples = new Map(variants.map((variant) => [variant.label, []]));
      for (let run = 0; run < runs; run++) {
        const order = [...variants].sort(() => Math.random() - 0.5);
        for (const variant of order)
          samples
            .get(variant.label)
            .push(await measure(browser, variant.url, scenario));
      }
      const keys = [
        'mount',
        ...actions,
        'filter',
        'restore',
        'heapMiB',
      ];
      const table = {};
      for (const [label, values] of samples)
        table[label] = Object.fromEntries(
          keys.map((key) => [
            key,
            Number(median(values.map((value) => value[key])).toFixed(2)),
          ]),
        );
      report.cases.push({ scenario, table, samples: Object.fromEntries(samples) });
      console.log(
        `\n${scenario.rows} rows, indexes=${scenario.indexes}, ${runs} runs, CPU x${throttle}`,
      );
      console.table(table);
    }
    await writeFile(
      join(output, 'report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
  }
} finally {
  await browser.close();
  for (const server of servers) await server.close();
}
