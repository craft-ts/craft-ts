#!/usr/bin/env node
// Reproducible before/after list measurements on disposable, frozen sources.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { cpus } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build, createServer, preview } from 'vite';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const destination = resolve(
  process.env.CRAFT_PERF_INDEX_REPORT ?? 'tmp/reactive-for-index/report.json',
);
await mkdir(dirname(destination), { recursive: true });
const scratch = await mkdtemp(join(workspace, 'tmp/reactive-index-'));
for (const file of [
  'apps/performance-smoke',
  'libs/core',
  'libs/component',
  'libs/style',
  'tsconfig.base.json',
  'package.json',
  'tools/vite-production-options.mjs',
]) {
  await cp(join(workspace, file), join(scratch, file), { recursive: true });
}
const renderer = join(scratch, 'libs/component/src/lib/render/interpreter.ts');
const current = await readFile(renderer, 'utf8');
const baselinePath = process.env.CRAFT_PERF_BASELINE_RENDERER;
const variants = baselinePath ? ['before', 'after'] : ['after'];
const runs = Number(process.env.CRAFT_PERF_INDEX_RUNS ?? 3);
const iterations = Number(process.env.CRAFT_PERF_INDEX_ITERATIONS ?? 6);
assert(
  Number.isInteger(runs) &&
    runs > 0 &&
    Number.isInteger(iterations) &&
    iterations > 0,
);
const report = {
  measuredAt: new Date().toISOString(),
  environment: { node: process.version, cpu: cpus()[0]?.model },
  settings: {
    runs,
    iterations,
    warmup: 2,
    baselinePath,
    baselineScope:
      'saved numeric renderer only; other runtime files shared by both variants',
    frozenWorkspace: true,
    timing:
      'instrumented app; synchronous dispatch, or completion across frames for scheduled rows',
    memory:
      'forced GC; DOM counters and JS heap, not an allocation attribution proof',
  },
  variants: [],
  samples: [],
};
// Slower scheduled profiles need fewer repetitions; the report records the
// actual sample count and each interaction. Sync profiles retain all runs.
report.settings.scheduledRuns = 1;
report.settings.scheduledIterations = 2;
const browser = await chromium.launch({ headless: true });
report.environment.chromium = browser.version();
let server;
async function fingerprint() {
  const hash = createHash('sha256');
  async function tree(directory) {
    for (const entry of (
      await readdir(directory, { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await tree(path);
      else {
        hash.update(path.slice(scratch.length));
        hash.update(await readFile(path));
      }
    }
  }
  await tree(join(scratch, 'libs'));
  return hash.digest('hex');
}
try {
  for (const variant of variants) {
    let source = current;
    if (variant === 'before') {
      source = await readFile(resolve(baselinePath), 'utf8');
      assert(source.includes('entry.index !== index ||'));
      assert(source.includes('[itemInput, index],'));
      // Benchmark-only boundary: preserve the old captured numeric behavior,
      // while the current smoke app consumes a yieldable reader. Never shipped.
      source = source.replace(
        '[itemInput, index],',
        '[itemInput, function* () { return index; }],',
      );
    }
    await writeFile(renderer, source);
    const sourceSha256 = await fingerprint();
    report.variants.push({ variant, sourceSha256 });
    const root = join(scratch, 'apps/performance-smoke');
    const common = {
      configFile: join(root, 'vite.config.ts'),
      logLevel: 'error',
      cacheDir: join(scratch, `cache-${variant}`),
    };
    for (const mode of ['development', 'production']) {
      if (mode === 'production') {
        await build({
          ...common,
          build: { outDir: join(scratch, `dist-${variant}`) },
        });
        server = await preview({
          ...common,
          build: { outDir: join(scratch, `dist-${variant}`) },
          preview: { host: '127.0.0.1', port: 0, strictPort: true },
        });
      } else {
        server = await createServer({
          ...common,
          server: { host: '127.0.0.1', port: 0, strictPort: true },
        });
        await server.listen();
      }
      const url = `http://127.0.0.1:${server.httpServer.address().port}`;
      for (const rows of [1000, 5000])
        for (const indexes of [false, true]) {
          for (const profile of [
            { scheduled: false, cpu: 1 },
            { scheduled: true, cpu: 1 },
            { scheduled: true, cpu: 4 },
          ]) {
            const group = {
              variant,
              mode,
              rows,
              indexes,
              ...profile,
              sourceSha256,
              runs: [],
            };
            const runCount = profile.scheduled ? 1 : runs;
            const actionIterations = profile.scheduled ? 2 : iterations;
            for (let run = 0; run < runCount; run++) {
              const context = await browser.newContext();
              try {
                const page = await context.newPage();
                const errors = [];
                page.on('pageerror', (error) => errors.push(error.message));
                const cdp = await context.newCDPSession(page);
                await cdp.send('Emulation.setCPUThrottlingRate', {
                  rate: profile.cpu,
                });
                await page.goto(
                  `${url}/?rows=${rows}&indexes=${indexes}&scheduled=${profile.scheduled}`,
                );
                await page.waitForFunction(
                  (count) =>
                    window.__smoke?.readyMs !== undefined &&
                    document.querySelectorAll('[data-row]').length === count,
                  rows,
                );
                const ready = await page.evaluate(() => ({
                  ...window.__smoke,
                  completeMs: performance.now(),
                }));
                async function memory() {
                  await cdp.send('HeapProfiler.collectGarbage');
                  return {
                    ...(await cdp.send('Runtime.getHeapUsage')),
                    ...(await cdp.send('Memory.getDOMCounters')),
                  };
                }
                const mountedMemory = await memory();
                const actions = await page.evaluate(
                  async ({ rows, indexes, scheduled, iterations, variant }) => {
                    const result = [];
                    const counters = () => ({
                      rowTemplates: window.__smoke.rowTemplates,
                      childRenders: window.__smoke.renders,
                      itemBindings: window.__smoke.itemBindings,
                      indexBindings: window.__smoke.indexBindings,
                    });
                    let expected = Array.from({ length: rows }, (_, id) => ({
                      id,
                      label: `Row ${id}`,
                    }));
                    let filtered = false;
                    const rowNodes = () => [
                      ...document.querySelectorAll('[data-row]'),
                    ];
                    const nextFrame = () =>
                      new Promise((resolve) => requestAnimationFrame(resolve));
                    const visible = () =>
                      filtered
                        ? expected.filter((row) => row.id % 2 === 0)
                        : expected;
                    function correct() {
                      const nodes = rowNodes(),
                        values = visible();
                      return (
                        nodes.length === values.length &&
                        nodes.every(
                          (node, i) =>
                            Number(node.getAttribute('data-row')) ===
                              values[i].id &&
                            node.textContent ===
                              `${indexes ? `${i + 1}. ` : ''}${values[i].label}` &&
                            (!indexes ||
                              Number(
                                node
                                  .querySelector('[data-position]')
                                  .getAttribute('data-position'),
                              ) === i),
                        )
                      );
                    }
                    for (const action of ['update-one', 'reverse', 'filter']) {
                      for (
                        let iteration = 0;
                        iteration < iterations + 2;
                        iteration++
                      ) {
                        const before = new Map(
                          rowNodes().map((node) => [
                            node.getAttribute('data-row'),
                            node,
                          ]),
                        );
                        const counts = counters();
                        if (action === 'update-one')
                          expected[0] = {
                            ...expected[0],
                            label: `${expected[0].label}!`,
                          };
                        if (action === 'reverse') expected.reverse();
                        if (action === 'filter') filtered = !filtered;
                        const started = performance.now();
                        document.getElementById(action).click();
                        const dispatchMs = performance.now() - started;
                        if (scheduled) {
                          const deadline = started + 20000;
                          while (!correct()) {
                            if (performance.now() > deadline)
                              throw new Error(`Stale scheduled ${action}`);
                            await nextFrame();
                          }
                        }
                        const completeMs = performance.now() - started;
                        if (!correct())
                          throw new Error(`Wrong ${action} data/indexes`);
                        for (const node of rowNodes()) {
                          const previous = before.get(
                            node.getAttribute('data-row'),
                          );
                          if (previous && node !== previous)
                            throw new Error(`Lost identity during ${action}`);
                        }
                        const after = counters();
                        const delta = Object.fromEntries(
                          Object.entries(after).map(([key, value]) => [
                            key,
                            value - counts[key],
                          ]),
                        );
                        if (action === 'reverse' && variant === 'after') {
                          if (
                            delta.rowTemplates !== 0 ||
                            delta.childRenders !== 0 ||
                            delta.itemBindings !== 0
                          )
                            throw new Error(
                              `Unnecessary row work: ${JSON.stringify(delta)}`,
                            );
                          if (delta.indexBindings !== (indexes ? rows : 0))
                            throw new Error('Wrong index binding count');
                        }
                        if (iteration >= 2)
                          result.push({
                            action,
                            dispatchMs,
                            completeMs,
                            ...delta,
                          });
                        await nextFrame();
                      }
                      if (filtered) {
                        document.getElementById('filter').click();
                        filtered = false;
                        while (!correct()) await nextFrame();
                      }
                    }
                    return result;
                  },
                  {
                    rows,
                    indexes,
                    scheduled: profile.scheduled,
                    iterations: actionIterations,
                    variant,
                  },
                );
                const settledMemory = await memory();
                // Repeated removals/restorations: index effects
                // belonging to removed entries must release their DOM and subscriptions.
                const cleanup = [];
                for (const cycles of run === 0 &&
                rows === 5000 &&
                indexes &&
                !profile.scheduled
                  ? [5, 20]
                  : []) {
                  await page.evaluate(
                    async ({ rows, cycles }) => {
                      const frame = () =>
                        new Promise((resolve) =>
                          requestAnimationFrame(resolve),
                        );
                      for (let n = 0; n < cycles; n++) {
                        document.getElementById('filter').click();
                        while (
                          document.querySelectorAll('[data-row]').length !==
                          rows / 2
                        )
                          await frame();
                        document.getElementById('filter').click();
                        while (
                          document.querySelectorAll('[data-row]').length !==
                          rows
                        )
                          await frame();
                      }
                    },
                    { rows, cycles },
                  );
                  cleanup.push({ cycles, ...(await memory()) });
                }
                assert.deepEqual(errors, []);
                group.runs.push({
                  ready,
                  mountedMemory,
                  settledMemory,
                  cleanup,
                  actions,
                });
              } finally {
                await context.close();
              }
            }
            report.samples.push(group);
            await writeFile(
              destination,
              JSON.stringify(report, null, 2) + '\n',
            );
            console.log(
              `${variant} ${mode} rows=${rows} indexes=${indexes} scheduled=${profile.scheduled} cpu=${profile.cpu} complete`,
            );
          }
        }
      if (mode === 'development') await server.close();
      else
        await new Promise((resolve, reject) =>
          server.httpServer.close((error) =>
            error ? reject(error) : resolve(),
          ),
        );
      server = undefined;
    }
  }
} finally {
  if (server) {
    if (server.close) await server.close();
    else await new Promise((resolve) => server.httpServer.close(resolve));
  }
  await browser.close();
  await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
  await rm(scratch, { recursive: true, force: true });
}
console.log(`Report: ${destination}`);
