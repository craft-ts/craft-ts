#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { cpus, arch, platform } from 'node:os';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';
const root = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(root, '../..');
const output = resolve(
  workspace,
  process.env.FRAMEWORK_BENCH_REPORT ?? 'tmp/commit-e135eeec9/frameworks.json',
);
const frameworks = (
  process.env.FRAMEWORK_BENCH_FRAMEWORKS ??
  'craft,react,vue,svelte,solid,vanilla'
).split(',');
assert(
  !frameworks.includes('foldkit') || frameworks.length === 1,
  'Run Foldkit separately: its build-time view branding must not transform the other fixtures.',
);
const configFile = join(
  root,
  frameworks[0] === 'foldkit' ? 'foldkit.vite.config.mjs' : 'vite.config.mjs',
);
const runs = Number(process.env.FRAMEWORK_BENCH_RUNS ?? 3);
const iterations = Number(process.env.FRAMEWORK_BENCH_ITERATIONS ?? 8);
const warmup = 3;
const smoke = process.env.FRAMEWORK_BENCH_CHECK === 'true';
assert(
  Number.isInteger(runs) &&
    runs > 0 &&
    Number.isInteger(iterations) &&
    iterations > 0,
);
const cases = smoke
  ? [
      { rows: 10, indexes: false, cpu: 1 },
      { rows: 10, indexes: true, cpu: 1 },
    ]
  : [
      { rows: 1000, indexes: false, cpu: 1 },
      { rows: 1000, indexes: true, cpu: 1 },
      { rows: 5000, indexes: false, cpu: 1 },
      { rows: 5000, indexes: true, cpu: 1 },
      { rows: 1000, indexes: true, cpu: 4 },
    ];
const versions = {};
for (const name of [
  'react',
  'react-dom',
  'vue',
  'svelte',
  'solid-js',
  'vite',
  '@vitejs/plugin-vue',
  '@sveltejs/vite-plugin-svelte',
  'vite-plugin-solid',
  ...(frameworks.includes('foldkit')
    ? ['foldkit', 'effect', '@effect/platform-browser', '@foldkit/vite-plugin']
    : []),
]) {
  try {
    versions[name] = JSON.parse(
      await readFile(join(root, 'node_modules', name, 'package.json'), 'utf8'),
    ).version;
  } catch {
    versions[name] = JSON.parse(
      await readFile(
        join(workspace, 'node_modules', name, 'package.json'),
        'utf8',
      ),
    ).version;
  }
}
async function hashSources() {
  const hash = createHash('sha256');
  async function walk(directory) {
    for (const entry of (
      await readdir(directory, { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      if (
        ['node_modules', 'dist', 'dist-foldkit', 'tmp', '.git'].includes(
          entry.name,
        )
      )
        continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else {
        hash.update(path.slice(workspace.length));
        hash.update(await readFile(path));
      }
    }
  }
  for (const path of [
    'libs/core',
    'libs/component',
    'libs/style',
    'apps/framework-benchmark',
  ])
    await walk(join(workspace, path));
  return hash.digest('hex');
}
const report = {
  measuredAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: workspace,
    encoding: 'utf8',
  }).trim(),
  sourceSha256: await hashSources(),
  environment: {
    node: process.version,
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0].model,
    logicalCpus: cpus().length,
  },
  settings: {
    runs,
    iterations,
    warmup,
    production: true,
    cases,
    order: 'seeded shuffle per case/run',
    seed: 135,
    timing:
      'native click to MutationObserver observing the committed revision; DOM only, excludes style/layout/paint and post-timing validation',
    nativeControls: true,
    buildConfig: configFile.slice(root.length + 1),
  },
  versions,
  samples: [],
};
await mkdir(dirname(output), { recursive: true });
await build({ configFile, logLevel: 'warn' });
const server = await preview({
  configFile,
  logLevel: 'warn',
});
const browser = await chromium.launch({ headless: true });
report.environment.chromium = browser.version();
const url = `http://127.0.0.1:${server.httpServer.address().port}`;
let seed = 135;
function shuffled(values) {
  const array = [...values];
  for (let i = array.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
try {
  for (const scenario of cases)
    for (let run = 0; run < runs; run++)
      for (const framework of shuffled(frameworks)) {
        report.activeCase = { framework, ...scenario, run };
        const context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          reducedMotion: 'reduce',
        });
        try {
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          const cdp = await context.newCDPSession(page);
          await cdp.send('Emulation.setCPUThrottlingRate', {
            rate: scenario.cpu,
          });
          await page.goto(
            `${url}/${framework}/?rows=${scenario.rows}&indexes=${scenario.indexes}`,
          );
          await page.waitForFunction(
            () => Number.isFinite(window.__bench?.bootstrapMs),
            undefined,
            { timeout: 30000 },
          );
          const startup = await page.evaluate(() => ({
            bootstrapMs: window.__bench.bootstrapMs,
            requests: performance.getEntriesByType('resource').length,
            decodedBytes: performance
              .getEntriesByType('resource')
              .reduce((n, e) => n + e.decodedBodySize, 0),
          }));
          const actions = await page.evaluate(
            async ({ rows, indexes, iterations, warmup }) => {
              const samples = [];
              let expected = Array.from({ length: rows }, (_, id) => ({
                id,
                label: `Row ${id}`,
              }));
              let filtered = false;
              const nodes = () => [...document.querySelectorAll('[data-row]')];
              const expectedVisible = () =>
                filtered
                  ? expected.filter((row) => row.id % 2 === 0)
                  : expected;
              function validate() {
                const actual = nodes(),
                  values = expectedVisible();
                if (actual.length !== values.length)
                  throw new Error(
                    `Wrong row count: ${actual.length}/${values.length}`,
                  );
                actual.forEach((node, i) => {
                  if (
                    Number(node.dataset.row) !== values[i].id ||
                    node.textContent !==
                      `${indexes ? `${i + 1}. ` : ''}${values[i].label}`
                  )
                    throw new Error(`Wrong data at ${i}: ${node.textContent}`);
                  if (
                    indexes &&
                    Number(
                      node.querySelector('[data-position]')?.dataset.position,
                    ) !== i
                  )
                    throw new Error(`Wrong position at ${i}`);
                });
              }
              const frame = () =>
                new Promise((resolve) =>
                  requestAnimationFrame(() => requestAnimationFrame(resolve)),
                );
              validate();
              await frame();
              for (const action of [
                'update-one',
                'update-tenth',
                'reverse',
                'filter',
              ]) {
                for (let i = 0; i < iterations + warmup; i++) {
                  const before = new Map(
                    nodes().map((node) => [node.dataset.row, node]),
                  );
                  if (action === 'update-one' || action === 'update-tenth')
                    expected = expected.map((row, i) =>
                      (action === 'update-one' ? i === 0 : i % 10 === 0)
                        ? { ...row, label: row.label + '!' }
                        : row,
                    );
                  else if (action === 'reverse') expected.reverse();
                  else filtered = !filtered;
                  const sample = await window.__bench
                    .run(action)
                    .catch((error) => {
                      throw new Error(
                        `${action} iteration ${i}: ${error.message}`,
                      );
                    });
                  validate();
                  for (const node of nodes())
                    if (
                      before.has(node.dataset.row) &&
                      before.get(node.dataset.row) !== node
                    )
                      throw new Error(
                        `Lost keyed identity: ${action}/${node.dataset.row}`,
                      );
                  if (i >= warmup)
                    samples.push({
                      action:
                        action === 'filter'
                          ? filtered
                            ? 'filter'
                            : 'restore'
                          : action,
                      ...sample,
                    });
                  await frame();
                }
                if (filtered) {
                  filtered = false;
                  await window.__bench.run('filter');
                  validate();
                  await frame();
                }
              }
              return samples;
            },
            { ...scenario, iterations, warmup },
          );
          await cdp.send('HeapProfiler.collectGarbage');
          const memory = {
            ...(await cdp.send('Runtime.getHeapUsage')),
            ...(await cdp.send('Memory.getDOMCounters')),
          };
          assert.deepEqual(errors, [], `${framework} errors`);
          report.samples.push({
            framework,
            ...scenario,
            run,
            startup,
            actions,
            memory,
            checks: {
              data: true,
              indexes: true,
              keyedIdentity: true,
              pageErrors: 0,
            },
          });
          await writeFile(output, JSON.stringify(report, null, 2) + '\n');
          console.log(
            `${framework} rows=${scenario.rows} indexes=${scenario.indexes} cpu=${scenario.cpu} run=${run + 1}: ${startup.bootstrapMs.toFixed(2)}ms mount; checks passed`,
          );
        } finally {
          await context.close();
        }
      }
  assert.equal(report.samples.length, cases.length * runs * frameworks.length);
  delete report.activeCase;
  report.status = 'complete';
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
}
console.log(`Report: ${output}`);
