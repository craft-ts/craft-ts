import assert from 'node:assert/strict';
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus, platform, release } from 'node:os';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { build, preview } from 'vite';
import { chromium } from '@playwright/test';
import { craftCompiler } from '../../dist/libs/compiler/src/vite.js';

const app = dirname(fileURLToPath(import.meta.url)),
  root = resolve(app, '../..');
const output = resolve(
  root,
  process.env.COMPILER_OUTPUT ?? 'tmp/compiler-benchmark',
);
const runs = Number(process.env.COMPILER_RUNS ?? 7),
  iterations = Number(process.env.COMPILER_ITERATIONS ?? 5);
const counts = (process.env.COMPILER_ROWS ?? '100,1000,5000')
  .split(',')
  .map(Number);
const selected = (
  process.env.COMPILER_CASES ?? 'rows,indexed,fields,nested,flat'
).split(',');
assert(
  Number.isInteger(runs) &&
    runs > 0 &&
    Number.isInteger(iterations) &&
    iterations > 0,
);
const aliases = (libraryRoot = root) => [
  {
    find: '@craft-ts/component/compiler-runtime',
    replacement: join(libraryRoot, 'libs/component/src/compiler-runtime.ts'),
  },
  ...['core', 'component', 'style'].map((name) => ({
    find: '@craft-ts/' + name,
    replacement: join(libraryRoot, 'libs/' + name + '/src/index.ts'),
  })),
];
await mkdir(output, { recursive: true });
const measuredFiles = [
  'libs/compiler/src/compiler.ts',
  'libs/compiler/src/vite.ts',
  'libs/component/src/lib/render/interpreter.ts',
  'libs/component/src/lib/render/compiled-template.ts',
  'libs/component/src/compiler-runtime.ts',
  'libs/core/src/index.ts',
  'libs/core/src/lib/lifecycle.ts',
  'libs/core/src/lib/host/craft-injector.ts',
  'libs/core/src/lib/host/craft-signal.ts',
  'libs/core/src/lib/host/craft-dom.ts',
  'apps/compiler-benchmark/main.ts',
  'apps/compiler-benchmark/run.mjs',
];
const sourceSha256 = Object.fromEntries(
  await Promise.all(
    measuredFiles.map(async (file) => [
      file,
      createHash('sha256')
        .update(await readFile(join(root, file)))
        .digest('hex'),
    ]),
  ),
);

const servers = new Map(),
  builds = {};
let browser;
const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length % 2
    ? s[s.length >> 1]
    : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const distribution = (values) => ({
  median: median(values),
  min: Math.min(...values),
  max: Math.max(...values),
  samples: values,
});
async function bytes(path) {
  let plain = 0,
    gzip = 0;
  for (const item of await readdir(path, { withFileTypes: true })) {
    const file = join(path, item.name);
    if (item.isDirectory()) {
      const child = await bytes(file);
      plain += child.plain;
      gzip += child.gzip;
    } else if (item.name.endsWith('.js')) {
      const content = await readFile(file);
      plain += content.length;
      gzip += gzipSync(content).length;
    }
  }
  return { plain, gzip };
}
async function open(url, kind, count, instrument = false) {
  const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    }),
    page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}?case=${kind}&rows=${count}&counts=${instrument}`);
  await page.waitForFunction(() => window.__compilerBench?.twoFramesMs);
  return { context, page, errors };
}
async function snapshot(page) {
  return page.evaluate(() => {
    const copy = document.getElementById('mount').cloneNode(true);
    for (const element of copy.querySelectorAll('*'))
      for (const attr of [...element.attributes])
        if (attr.name.startsWith('data-craft-'))
          element.removeAttribute(attr.name);
    const walk = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT),
      comments = [];
    while (walk.nextNode()) comments.push(walk.currentNode);
    for (const comment of comments) comment.remove();
    return copy.innerHTML;
  });
}
const actions = (kind) =>
  kind === 'fields'
    ? ['field-first', 'field-last']
    : ['update-one', 'update-tenth', 'reverse', 'reverse', 'filter', 'restore'];
try {
  const labels = (
    process.env.COMPILER_VARIANTS ??
    process.env.COMPILER_VARIANT ??
    'runtime,dom,compiled,clone'
  ).split(',');
  for (const spec of labels) {
    const [selection, libraryPath] = spec.split('@');
    const [label, selectedMode] = selection.split('=');
    const mode = selectedMode ?? label;
    const libraryRoot = libraryPath ? resolve(root, libraryPath) : root;
    assert(
      ['runtime', 'dom', 'compiled', 'clone', 'lean'].includes(mode),
      'Unknown variant ' + mode,
    );
    const enabled = mode !== 'runtime';
    const variantOptions = {
      dom: mode === 'clone' ? 'clone' : 'create',
      lists: mode !== 'dom',
      lean: mode === 'lean',
    };
    const dist = join(output, 'dist', label),
      decisions = [];
    const started = performance.now();
    await build({
      configFile: false,
      root: app,
      logLevel: 'error',
      plugins: enabled
        ? [
            craftCompiler({
              ...variantOptions,
              onReport: (file, components) =>
                decisions.push({ file, components }),
            }),
          ]
        : [],
      resolve: { alias: aliases(libraryRoot) },
      build: {
        outDir: dist,
        emptyOutDir: true,
        minify: 'oxc',
        target: 'es2022',
        rolldownOptions: { input: join(app, 'index.html') },
      },
    });
    builds[label] = {
      options: variantOptions,
      mode,
      libraryRoot,
      runtimeSha256: Object.fromEntries(
        await Promise.all(
          [
            'libs/core/src/index.ts',
            'libs/core/src/lib/lifecycle.ts',
            'libs/core/src/lib/host/craft-injector.ts',
            'libs/component/src/lib/render/interpreter.ts',
          ].map(async (file) => [
            file,
            createHash('sha256')
              .update(await readFile(join(libraryRoot, file)))
              .digest('hex'),
          ]),
        ),
      ),
      buildMs: performance.now() - started,
      ...(await bytes(dist)),
      decisions,
    };
    const server = await preview({
      configFile: false,
      root: app,
      logLevel: 'error',
      build: { outDir: dist },
      preview: { host: '127.0.0.1', port: 0 },
    });
    servers.set(label, {
      url: `http://127.0.0.1:${server.httpServer.address().port}/`,
      server,
    });
  }
  browser = await chromium.launch({ headless: true });
  const contracts = [];
  for (const kind of selected) {
    const traces = [];
    for (const [label, { url }] of servers) {
      const { page, context, errors } = await open(url, kind, 100, true),
        trace = [await snapshot(page)];
      await page.evaluate(
        () => (window.__retained = document.querySelector('[data-row]')),
      );
      const reads = [];
      for (const action of actions(kind)) {
        await page.evaluate(() => {
          window.__compilerBench.reads.a = 0;
          window.__compilerBench.reads.b = 0;
        });
        await page.evaluate((a) => window.__compilerBench.run(a), action);
        trace.push(await snapshot(page));
        reads.push(
          await page.evaluate(() => ({ ...window.__compilerBench.reads })),
        );
        if (action === 'update-one' || action === 'reverse')
          assert(
            await page.evaluate(
              () =>
                document.querySelector('[data-row="0"]') === window.__retained,
            ),
            `${label}: retained row identity`,
          );
      }
      if (kind === 'fields') {
        assert.deepEqual(
          reads,
          [
            { a: 1, b: 0 },
            { a: 0, b: 1 },
          ],
          `${label}: independent bindings`,
        );
      }
      await page.evaluate(() => window.__compilerBench.run('destroy'));
      assert.equal(await page.locator('#mount').textContent(), '');
      assert.deepEqual(errors, []);
      traces.push({ label, trace });
      await context.close();
    }
    for (const trace of traces.slice(1))
      assert.deepEqual(
        traces[0].trace,
        trace.trace,
        `${kind}/${trace.label}: DOM equivalence`,
      );
    contracts.push({ case: kind, passed: true, steps: traces[0].trace.length });
  }
  const jobs = [];
  for (let run = 0; run < runs; run++)
    for (const kind of selected)
      for (const count of kind === 'fields' ? [128] : counts)
        for (const label of servers.keys())
          jobs.push({ run, kind, count, label });
  // Seeded shuffle: fresh contexts, interleaved variants and reproducible order.
  let seed = 16112026;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let i = jobs.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [jobs[i], jobs[j]] = [jobs[j], jobs[i]];
  }
  const raw = [];
  for (const job of jobs) {
    const { page, context, errors } = await open(
      servers.get(job.label).url,
      job.kind,
      job.count,
    );
    const data = await page.evaluate(() => ({
      mount: window.__compilerBench.mountMs,
      ready: window.__compilerBench.navigationToReadyMs,
      twoFrames: window.__compilerBench.twoFramesMs,
      nodes: document.getElementById('mount').querySelectorAll('*').length,
    }));
    const samples = {};
    for (let loop = 0; loop < iterations + 2; loop++)
      for (const action of actions(job.kind)) {
        let ms;
        try {
          ms = await page.evaluate(
            (a) => window.__compilerBench.run(a),
            action,
          );
        } catch (error) {
          await writeFile(
            join(output, 'failed-case.json'),
            JSON.stringify({ job, loop, action, errors }, null, 2),
          );
          throw error;
        }
        if (loop >= 2) (samples[action] ??= []).push(ms);
      }
    const cdp = await context.newCDPSession(page);
    await cdp.send('HeapProfiler.collectGarbage');
    data.heapMiB =
      (await cdp.send('Runtime.getHeapUsage')).usedSize / 1024 / 1024;
    data.actions = Object.fromEntries(
      Object.entries(samples).map(([name, values]) => [name, median(values)]),
    );
    assert.deepEqual(errors, []);
    raw.push({ ...job, ...data });
    await context.close();
    if (raw.length % 10 === 0)
      console.log(`${raw.length}/${jobs.length} navigations`);
  }
  const summary = [];
  for (const kind of selected)
    for (const count of kind === 'fields' ? [128] : counts)
      for (const label of servers.keys()) {
        const rows = raw.filter(
          (r) => r.kind === kind && r.count === count && r.label === label,
        );
        summary.push({
          case: kind,
          count,
          label,
          ...Object.fromEntries(
            ['mount', 'ready', 'twoFrames', 'heapMiB'].map((key) => [
              key,
              distribution(rows.map((r) => r[key])),
            ]),
          ),
          actions: Object.fromEntries(
            [...new Set(actions(kind))].map((key) => [
              key,
              distribution(rows.map((r) => r.actions[key])),
            ]),
          ),
        });
      }
  const result = {
    timestamp: new Date().toISOString(),
    base: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    sourceSha256,
    environment: {
      cpu: cpus()[0].model,
      platform: platform(),
      release: release(),
      node: process.version,
      chromium: browser.version(),
    },
    runs,
    iterations,
    contracts,
    builds,
    summary,
    raw,
  };
  await writeFile(
    join(output, 'results.json'),
    JSON.stringify(result, null, 2) + '\n',
  );
  console.table(
    summary.map((r) => ({
      case: r.case,
      count: r.count,
      variant: r.label,
      mount: r.mount.median,
      ready: r.ready.median,
      heap: r.heapMiB.median,
    })),
  );
  console.log(join(output, 'results.json'));
} finally {
  await browser?.close();
  for (const { server } of servers.values())
    await new Promise((done) => server.httpServer.close(done));
}
