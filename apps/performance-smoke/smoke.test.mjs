#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import { cpus, platform, arch } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const runs = Number(process.env.CRAFT_PERF_RUNS ?? 5);
const iterations = Number(process.env.CRAFT_PERF_ITERATIONS ?? 20);
assert(
  Number.isInteger(runs) &&
    runs > 0 &&
    Number.isInteger(iterations) &&
    iterations > 0,
);
await mkdir(join(workspace, 'tmp'), { recursive: true });
const scratch = await mkdtemp(join(workspace, 'tmp/performance-smoke-'));
const root = join(scratch, 'apps/performance-smoke');
await cp(join(workspace, 'apps/performance-smoke'), root, { recursive: true });
// Freeze the runtime too: other chats may edit it while the benchmark runs.
for (const file of [
  'libs/core',
  'libs/component',
  'libs/style',
  'tsconfig.base.json',
  'package.json',
  'tools/vite-production-options.mjs',
]) {
  await cp(join(workspace, file), join(scratch, file), { recursive: true });
}
const originalStyle = await readFile(join(root, 'src/smoke.style.ts'));
const originalVersion = await readFile(join(root, 'src/version.ts'));
const port = await freePort();
const url = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  CRAFT_PERF_ROOT: root,
  CRAFT_PERF_CACHE: join(scratch, 'cache'),
  CRAFT_PERF_DIST: join(scratch, 'dist'),
};
const config = join(root, 'vite.config.ts');
const report = {
  measuredAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
  },
  settings: {
    runs,
    iterations,
    source:
      'frozen copy of workspace TypeScript (includes uncommitted changes)',
    sourceSha256: await sourceHash(join(scratch, 'libs')),
    browserCache: 'new browser context per navigation',
    serverCache: 'first start empty, subsequent requests warm',
  },
  startup: [],
  interactions: [],
  edits: [],
};
let server;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  report.environment.chromium = browser.version();
  const started = performance.now();
  server = launch(['--config', config, '--port', String(port)]);
  await waitForServer(server);
  report.devServerReadyMs = performance.now() - started;
  console.log(`Dev server ready: ${report.devServerReadyMs.toFixed(0)} ms`);
  await measureMode('development');
  await measureMode('development-indexes', 1, [1000, 5000], '&indexes=true');
  await measureEdits();
  await stop(server);
  server = undefined;
  await writeFile(join(root, 'src/version.ts'), originalVersion);
  await writeFile(join(root, 'src/smoke.style.ts'), originalStyle);

  const buildStarted = performance.now();
  const build = launch(['build', '--config', config]);
  const code = await build.exited;
  assert.equal(code, 0, build.output());
  report.productionBuildMs = performance.now() - buildStarted;
  report.productionAssets = await assets(join(scratch, 'dist'));
  server = launch([
    'preview',
    '--config',
    config,
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ]);
  await waitForServer(server);
  await measureMode('production');
  await measureMode('production-indexes', 1, [1000, 5000], '&indexes=true');
  // A separate run approximates a slower CPU; it does not emulate a phone.
  await measureMode('production-cpu4x', 4, [1000]);
  await measureMode(
    'production-inline-rows',
    1,
    [1000, 5000],
    '&components=false',
  );
  await measureMode(
    'production-dev-runtime',
    1,
    [1000],
    '&runtime=development',
  );
  const destination = resolve(
    process.env.CRAFT_PERF_REPORT ??
      join(workspace, 'tmp/performance-smoke.json'),
  );
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
  console.log(`Report: ${destination}`);
  console.table(
    report.startup.map(({ mode, rows, samples }) => ({
      mode,
      rows,
      readyMedianMs: median(samples.map((s) => s.readyMs)),
      bootstrapMedianMs: median(samples.map((s) => s.bootstrapMs)),
      requests: samples[0].requests,
      decodedKB: Math.round(samples[0].decodedBytes / 1024),
    })),
  );
  console.table(
    report.interactions.map(({ mode, rows, action, samples }) => ({
      mode,
      rows,
      action,
      domMedianMs: median(samples.map((s) => s.domMs)),
      domP95Ms: percentile(
        samples.map((s) => s.domMs),
        0.95,
      ),
      frameMedianMs: median(samples.map((s) => s.frameMs)),
      childRendersMedian: median(samples.map((s) => s.childRenders)),
    })),
  );
  console.table(
    report.edits.map((e) => ({
      kind: e.kind,
      medianMs: median(e.samples),
      p95Ms: percentile(e.samples, 0.95),
    })),
  );
} finally {
  if (server) await stop(server);
  await browser?.close();
  await rm(scratch, { recursive: true, force: true });
}

async function measureMode(
  mode,
  cpu = 1,
  sizes = [0, 100, 1000, 5000],
  query = '',
) {
  for (const rows of sizes) {
    const samples = [];
    for (let i = 0; i < runs; i++) {
      const { context, page } = await newPage(cpu);
      try {
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(`${url}/?rows=${rows}${query}`, { waitUntil: 'load' });
        await page
          .waitForFunction(() => window.__smoke?.readyMs !== undefined)
          .catch(async (error) => {
            throw new Error(
              `${error.message}\nPage errors: ${JSON.stringify(errors)}\n${server.output()}\n${(await page.locator('body').innerText()).slice(0, 2000)}`,
            );
          });
        assert.equal(await page.locator('[data-row]').count(), rows);
        assert.deepEqual(errors, []);
        samples.push(
          await page.evaluate(() => ({
            ...window.__smoke,
            requests: performance.getEntriesByType('resource').length,
            decodedBytes: performance
              .getEntriesByType('resource')
              .reduce((sum, entry) => sum + entry.decodedBodySize, 0),
          })),
        );
        // Keep the last navigation for interaction measurements.
        if (i === runs - 1 && rows > 0)
          await interactions(page, mode, rows, errors);
        assert.deepEqual(errors, []);
      } finally {
        await context.close();
      }
    }
    report.startup.push({ mode, rows, samples });
    console.log(
      `${mode} ${rows} rows: ready median ${median(samples.map((s) => s.readyMs))} ms, bootstrap ${median(samples.map((s) => s.bootstrapMs))} ms`,
    );
  }
}

async function interactions(page, mode, rows, errors) {
  for (const action of [
    'increment',
    'update-one',
    'update-tenth',
    'reverse',
    'filter',
  ]) {
    const samples = await page.evaluate(
      async ({ action, iterations, rows }) => {
        const results = [];
        const rowNodes = () => [...document.querySelectorAll('[data-row]')];
        for (let i = 0; i < iterations + 3; i++) {
          const before = rowNodes();
          const originalFirst = before[0];
          const textBefore = originalFirst?.textContent;
          const labelsBefore = before.map((node) => node.textContent);
          const countBefore = document.querySelector('#count').textContent;
          const rendersBefore = window.__smoke.renders;
          const started = performance.now();
          let observer;
          const changed = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              observer.disconnect();
              reject(new Error(`No DOM update: ${action}`));
            }, 15000);
            observer = new MutationObserver(() => {
              const current = document.querySelectorAll('[data-row]');
              const done =
                action === 'increment'
                  ? document.querySelector('#count').textContent !== countBefore
                  : action === 'filter'
                    ? current.length !== before.length
                    : action === 'reverse'
                      ? current[0] !== originalFirst
                      : current[0]?.textContent !== textBefore;
              if (!done) return;
              const domMs = performance.now() - started;
              clearTimeout(timeout);
              observer.disconnect();
              resolve(domMs);
            });
            observer.observe(document.querySelector('craft-root'), {
              subtree: true,
              childList: true,
              characterData: true,
              attributes: true,
            });
          });
          document.getElementById(action).click();
          const dispatchMs = performance.now() - started;
          const domMs = await changed;
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
          const frameMs = performance.now() - started;
          // Validate actual final data, not merely that some DOM changed.
          const after = rowNodes();
          if (action === 'filter') {
            const expected = i % 2 === 0 ? Math.ceil(rows / 2) : rows;
            if (after.length !== expected)
              throw new Error(`Wrong filter count: ${after.length}`);
          } else if (action === 'increment') {
            if (
              Number(document.querySelector('#count').textContent) !==
              Number(countBefore) + 1
            )
              throw new Error('Wrong counter');
            if (after.some((node, index) => node !== before[index]))
              throw new Error('Counter replaced rows');
          } else if (action === 'reverse') {
            if (
              after.some(
                (node, index) => node !== before[before.length - index - 1],
              )
            )
              throw new Error('Reverse lost keyed identity');
          } else {
            if (
              after.some(
                (node, index) =>
                  node.textContent !==
                  labelsBefore[index] +
                    ((action === 'update-one' ? index === 0 : index % 10 === 0)
                      ? '!'
                      : ''),
              )
            )
              throw new Error('Wrong row update');
            if (after.some((node, index) => node !== before[index]))
              throw new Error('Update lost keyed identity');
          }
          const positions = [...document.querySelectorAll('[data-position]')];
          if (
            positions.some(
              (node, index) =>
                Number(node.getAttribute('data-position')) !== index,
            )
          )
            throw new Error('Wrong reactive indexes');
          // Three warmup interactions are excluded.
          if (i >= 3)
            results.push({
              domMs,
              dispatchMs,
              frameMs,
              childRenders: window.__smoke.renders - rendersBefore,
            });
        }
        // Return the list to its full size for the next test.
        if (
          action === 'filter' &&
          document.querySelectorAll('[data-row]').length !== rows
        ) {
          document.getElementById('filter').click();
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          );
        }
        return results;
      },
      { action, iterations, rows },
    );
    assert.deepEqual(errors, []);
    report.interactions.push({ mode, rows, action, samples });
  }
}

async function measureEdits() {
  const { context, page } = await newPage();
  try {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let reloads = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) reloads++;
    });
    await page.goto(`${url}/?rows=1000`);
    await page.waitForFunction(() => window.__smoke?.readyMs !== undefined);
    for (const kind of ['typescript', 'style']) {
      const samples = [];
      const reloadsBefore = reloads;
      for (let i = 0; i < runs; i++) {
        const started = performance.now();
        if (kind === 'typescript') {
          const version = `smoke-${i + 1}`;
          await writeFile(
            join(root, 'src/version.ts'),
            `export const version = '${version}';\n`,
          );
          await page.waitForFunction(
            (version) =>
              document.querySelector('#version')?.textContent === version &&
              window.__smoke?.readyMs !== undefined,
            version,
          );
        } else {
          const display = i % 2 === 0 ? 'flex' : 'block';
          await writeFile(
            join(root, 'src/smoke.style.ts'),
            `import { craftStyles, display } from '@craft-ts/style';\nexport const smokeStyle = craftStyles('performanceSmoke', { root: [display.${display}] });\n`,
          );
          await page.waitForFunction((display) => {
            const element = document.querySelector('craft-root > div');
            return (
              element &&
              getComputedStyle(element).display === display &&
              window.__smoke?.readyMs !== undefined
            );
          }, display);
        }
        samples.push(performance.now() - started);
      }
      report.edits.push({
        kind,
        rows: 1000,
        samples,
        documentNavigations: reloads - reloadsBefore,
      });
      console.log(
        `${kind} edit → ready: ${median(samples)} ms (${reloads - reloadsBefore} navigations)`,
      );
    }
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}

async function newPage(cpu = 1) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  if (cpu !== 1) {
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  }
  return { context, page };
}

function launch(args) {
  const child = spawn(
    process.execPath,
    [join(workspace, 'node_modules/vite/bin/vite.js'), ...args],
    { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  return { child, exited, output: () => output };
}
async function waitForServer(server) {
  const deadline = performance.now() + 60000;
  while (performance.now() < deadline) {
    if (server.child.exitCode !== null) throw new Error(server.output());
    // A raw TCP probe avoids prewarming Vite's HTML/style/module transforms.
    if (await listening(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Server timeout\n${server.output()}`);
}
function listening(port) {
  return new Promise((resolve) => {
    import('node:net').then(({ connect }) => {
      const socket = connect(port, '127.0.0.1');
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => resolve(false));
    });
  });
}
async function stop(server) {
  if (server.child.exitCode !== null) return;
  server.child.kill('SIGTERM');
  const timeout = setTimeout(() => server.child.kill('SIGKILL'), 5000);
  try {
    await server.exited;
  } finally {
    clearTimeout(timeout);
  }
}
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}
async function assets(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await assets(file)));
    else if (/\.(js|css)$/.test(file))
      result.push({
        file: file.slice(join(scratch, 'dist').length + 1),
        bytes: (await stat(file)).size,
        gzipBytes: gzipSync(await readFile(file)).length,
      });
  }
  return result;
}
async function sourceHash(directory) {
  const hash = createHash('sha256');
  const walk = async (current) => {
    const entries = (await readdir(current, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const file = join(current, entry.name);
      if (entry.isDirectory()) await walk(file);
      else {
        hash.update(file.slice(directory.length));
        hash.update(await readFile(file));
      }
    }
  };
  await walk(directory);
  return hash.digest('hex');
}
function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return (
    Math.round(
      sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] * 100,
    ) / 100
  );
}
function median(values) {
  return percentile(values, 0.5);
}
