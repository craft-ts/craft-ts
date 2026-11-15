#!/usr/bin/env node
// Runtime-only campaign: the same generic CraftTS fixture, built against
// several runtimes taken from git refs (or the working tree). Nothing in the
// fixture changes between variants: no purity marker, no prepared row, no
// inline control view. Libraries are extracted into a scratch folder; the
// worktree is never patched.
//
//   RUNTIME_ONLY_VARIANTS="reference=main,candidate=WORKTREE"
//   RUNTIME_ONLY_RUNS=5 RUNTIME_ONLY_ITERATIONS=8
//   RUNTIME_ONLY_CASES='[{"rows":1000,"indexes":false}]'
//   RUNTIME_ONLY_OUTPUT=tmp/runtime-only/<name>
//   RUNTIME_ONLY_SKIP_TIMING=true   (contracts and sizes only)
//   RUNTIME_ONLY_COMMENTS_MAY_CHANGE=true  (contracts ignore the comment count)
//   RUNTIME_ONLY_COUNTS=true        (separate instrumented build: counters)
//
// The first variant is the reference of every comparison.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { arch, cpus, platform } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import ts from 'typescript';
import { build } from 'vite';

const app = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(app, '../..');
const output = resolve(
  workspace,
  process.env.RUNTIME_ONLY_OUTPUT ?? 'tmp/runtime-only/latest',
);
const variants = (
  process.env.RUNTIME_ONLY_VARIANTS ?? 'reference=main,candidate=WORKTREE'
)
  .split(',')
  .map((entry) => {
    const [label, ref] = entry.split('=');
    assert(label && ref && /^[\w-]+$/.test(label), `Bad variant ${entry}`);
    return { label, ref };
  });
assert(variants.length >= 2, 'Compare at least two runtimes');
const runs = Number(process.env.RUNTIME_ONLY_RUNS ?? 5);
const iterations = Number(process.env.RUNTIME_ONLY_ITERATIONS ?? 8);
const warmup = 3;
const cases = JSON.parse(
  process.env.RUNTIME_ONLY_CASES ??
    JSON.stringify([
      { rows: 100, indexes: false },
      { rows: 1000, indexes: false },
      { rows: 1000, indexes: true },
      { rows: 5000, indexes: false },
      { rows: 5000, indexes: true },
    ]),
);
const contractCases = [
  { rows: 30, indexes: false },
  { rows: 30, indexes: true },
];
const skipTiming = process.env.RUNTIME_ONLY_SKIP_TIMING === 'true';
const boundaryCommentsMayChange =
  process.env.RUNTIME_ONLY_COMMENTS_MAY_CHANGE === 'true';
const withCounts = process.env.RUNTIME_ONLY_COUNTS === 'true';
const countCases = [
  { rows: 1000, indexes: false },
  { rows: 1000, indexes: true },
];
// Counters are inserted at the start of these functions, in a separate copy
// of each runtime. They never reach the timed bundles. A function a runtime
// does not have is simply not counted.
const counters = [
  ['libs/core/src/lib/host/craft-injector.ts', 'createNativeCraftInjector', 'injectors'],
  ['libs/core/src/lib/host/craft-injector.ts', 'addProviderRecord', 'providerRecords'],
  ['libs/core/src/lib/host/craft-signal.ts', 'craftSignal', 'publicSignals'],
  ['libs/core/src/lib/host/craft-signal.ts', 'ɵcraftPrivateCell', 'privateCells'],
  ['libs/core/src/lib/host/craft-signal.ts', 'craftComputed', 'computeds'],
  ['libs/core/src/lib/host/craft-compat.ts', 'effect', 'effects'],
  ['libs/core/src/lib/craft-generator-runtime.ts', 'runCraftGenerator', 'generatorDriverRuns'],
];
async function instrument(root) {
  const applied = [];
  for (const [path, name, key] of counters) {
    const file = join(root, path);
    const text = await readFile(file, 'utf8');
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const fn = ast.statements.find(
      (node) =>
        ts.isFunctionDeclaration(node) && node.name?.text === name && node.body,
    );
    if (!fn) continue;
    const at = fn.body.getStart(ast) + 1;
    await writeFile(
      file,
      text.slice(0, at) +
        `\n{ const c = ((globalThis as any).__craftCounts ??= {}); c[${JSON.stringify(key)}] = (c[${JSON.stringify(key)}] ?? 0) + 1; }` +
        text.slice(at),
    );
    applied.push(key);
  }
  return applied;
}
const libs = ['libs/core', 'libs/component', 'libs/style', 'libs/test-type'];

await rm(join(output, 'build'), { recursive: true, force: true });
await rm(join(output, 'dist'), { recursive: true, force: true });
await mkdir(output, { recursive: true });

async function hashTree(root, paths) {
  const hash = createHash('sha256');
  async function walk(directory) {
    for (const entry of (
      await readdir(directory, { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else {
        hash.update(path.slice(root.length));
        hash.update(await readFile(path));
      }
    }
  }
  for (const path of paths) {
    const full = join(root, path);
    if ((await stat(full)).isDirectory()) await walk(full);
    else {
      hash.update(path);
      hash.update(await readFile(full));
    }
  }
  return hash.digest('hex');
}

// --- Fixture: copied once from this worktree, identical for every variant.
const fixture = join(output, 'build/fixture');
const fixtureFiles = [
  'src/common.js',
  'src/craft/main.ts',
  'craft/index.html',
  'style.css',
];
for (const file of fixtureFiles)
  await cp(join(app, file), join(fixture, file), { recursive: true });
const fixtureSha256 = await hashTree(fixture, fixtureFiles);
const fixtureMain = await readFile(join(fixture, 'src/craft/main.ts'), 'utf8');

// The contract page is a separate entry: the timed page stays untouched.
function contractsSource(main) {
  const replace = (text, from, to) => {
    assert(text.includes(from), `Fixture changed: ${from}`);
    return text.replace(from, to);
  };
  let text = replace(
    main,
    '  craftAppConfig,',
    '  AppSnapshotRegistry,\n  ɵcaptureCraftReplayTarget,\n  ɵresolveCraftReplayTarget,\n  craftAppConfig,',
  );
  text = replace(
    text,
    '    const injector = ɵinject(ɵInjector);',
    `    const injector = ɵinject(ɵInjector);
    let registry: any;
    (globalThis as any).__craftContracts = () => {
      registry ??= ɵrunInInjectionContext(injector, () => craftUse(AppSnapshotRegistry()));
      const reports = registry.activeEffects();
      const element = document.querySelector('#rows');
      const target = element ? ɵcaptureCraftReplayTarget(element) : undefined;
      const rows = [...document.querySelectorAll('[data-row]')].map((node) => {
        const captured = ɵcaptureCraftReplayTarget(node);
        return captured ? [captured, ɵresolveCraftReplayTarget(captured).status] : null;
      });
      const dom = { element: 0, text: 0, comment: 0 };
      const walker = document.createTreeWalker(document.querySelector('#mount')!, NodeFilter.SHOW_ALL);
      while (walker.nextNode()) {
        const key = ({ 1: 'element', 3: 'text', 8: 'comment' } as any)[walker.currentNode.nodeType];
        if (key) (dom as any)[key]++;
      }
      return {
        reports: reports.length,
        tags: reports.map((r: any) => [r.source, r.from]),
        dom,
        replay: target ? ɵresolveCraftReplayTarget(target).status : 'unregistered',
        descriptor: target,
        rows,
      };
    };`,
  );
  text = replace(text, 'bootstrapCraft({', 'const contractsApp = bootstrapCraft({');
  return (
    text + '\n(globalThis as any).__craftDestroy = () => contractsApp.destroy();\n'
  );
}
await mkdir(join(fixture, 'contracts'), { recursive: true });
await writeFile(
  join(fixture, 'src/craft/contracts.ts'),
  contractsSource(fixtureMain),
);
await writeFile(
  join(fixture, 'contracts/index.html'),
  (await readFile(join(fixture, 'craft/index.html'), 'utf8')).replace(
    '/src/craft/main.ts',
    '/src/craft/contracts.ts',
  ),
);

// --- Runtimes.
for (const variant of variants) {
  const root = join(output, 'build', variant.label);
  await mkdir(root, { recursive: true });
  if (variant.ref === 'WORKTREE') {
    variant.commit = `${execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, encoding: 'utf8' }).trim()}+worktree`;
    for (const path of [...libs, 'tsconfig.base.json'])
      await cp(join(workspace, path), join(root, path), {
        recursive: true,
        filter: (source) =>
          !source.split('/').some((part) => ['node_modules', 'dist'].includes(part)),
      });
  } else {
    variant.commit = execFileSync('git', ['rev-parse', variant.ref], {
      cwd: workspace,
      encoding: 'utf8',
    }).trim();
    const archive = execFileSync(
      'git',
      ['archive', variant.commit, ...libs, 'tsconfig.base.json'],
      { cwd: workspace, maxBuffer: 1 << 30 },
    );
    execFileSync('tar', ['-x', '-C', root], { input: archive });
  }
  variant.sourceSha256 = await hashTree(root, libs);
  const alias = {
    '@craft-ts/core': join(root, 'libs/core/src/index.ts'),
    '@craft-ts/component': join(root, 'libs/component/src/index.ts'),
    '@craft-ts/style': join(root, 'libs/style/src/index.ts'),
  };
  const builds = [
    ['timing', 'craft/index.html', alias],
    ['contracts', 'contracts/index.html', alias],
  ];
  if (withCounts) {
    const countsRoot = join(output, 'build', `${variant.label}-counts`);
    await cp(join(root, 'libs'), join(countsRoot, 'libs'), { recursive: true });
    await cp(join(root, 'tsconfig.base.json'), join(countsRoot, 'tsconfig.base.json'));
    variant.counters = await instrument(countsRoot);
    builds.push([
      'counts',
      'craft/index.html',
      {
        '@craft-ts/core': join(countsRoot, 'libs/core/src/index.ts'),
        '@craft-ts/component': join(countsRoot, 'libs/component/src/index.ts'),
        '@craft-ts/style': join(countsRoot, 'libs/style/src/index.ts'),
      },
    ]);
  }
  for (const [kind, entry, buildAlias] of builds) {
    const outDir = join(output, 'dist', variant.label, kind);
    await build({
      configFile: false,
      root: fixture,
      base: `/${variant.label}/${kind}/`,
      logLevel: 'warn',
      resolve: { alias: buildAlias },
      build: {
        outDir,
        emptyOutDir: true,
        minify: 'oxc',
        sourcemap: false,
        rolldownOptions: { input: { page: join(fixture, entry) } },
      },
    });
    if (kind === 'timing') {
      const assets = join(outDir, 'assets');
      let raw = 0,
        gzip = 0;
      for (const file of await readdir(assets))
        if (file.endsWith('.js')) {
          const bytes = await readFile(join(assets, file));
          raw += bytes.length;
          gzip += gzipSync(bytes, { level: 9 }).length;
        }
      variant.bundle = { minifiedBytes: raw, gzipBytes: gzip };
    }
  }
}

// --- One static server for every build.
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
};
const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
  let file = join(output, 'dist', path);
  if (!file.startsWith(join(output, 'dist'))) return response.writeHead(403).end();
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    response.writeHead(200, {
      'content-type': types[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;

const report = {
  measuredAt: new Date().toISOString(),
  workspaceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: workspace,
    encoding: 'utf8',
  }).trim(),
  fixtureSha256,
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
    contractCases,
    order: 'seeded shuffle of variants per case/run, fresh browser context per navigation',
    seed: 611,
    timing:
      'mount: begin() to all rows in the DOM; actions: native click to MutationObserver seeing the committed revision (DOM only, before paint)',
    heap: 'Runtime.getHeapUsage after HeapProfiler.collectGarbage, after the same action sequence',
  },
  variants: variants.map(
    ({ label, ref, commit, sourceSha256, bundle, counters }) => ({
      label,
      ref,
      commit,
      sourceSha256,
      bundle,
      counters,
    }),
  ),
  contracts: [],
  counts: [],
  samples: [],
};
const save = () =>
  writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');

let seed = 611;
function shuffled(values) {
  const array = [...values];
  for (let i = array.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Runs the action sequence in the page, validating data, positions and keyed
// identity after every action (warm-up included), outside the timed window.
async function exercise(page, scenario, iterations, warmup) {
  return page.evaluate(
    async ({ rows, indexes, iterations, warmup }) => {
      const samples = [];
      let expected = Array.from({ length: rows }, (_, id) => ({
        id,
        label: `Row ${id}`,
      }));
      let filtered = false;
      const nodes = () => [...document.querySelectorAll('[data-row]')];
      const expectedVisible = () =>
        filtered ? expected.filter((row) => row.id % 2 === 0) : expected;
      function validate() {
        const actual = nodes(),
          values = expectedVisible();
        if (actual.length !== values.length)
          throw new Error(`Wrong row count: ${actual.length}/${values.length}`);
        actual.forEach((node, i) => {
          if (
            Number(node.dataset.row) !== values[i].id ||
            node.textContent !== `${indexes ? `${i + 1}. ` : ''}${values[i].label}`
          )
            throw new Error(`Wrong data at ${i}: ${node.textContent}`);
          if (
            indexes &&
            Number(node.querySelector('[data-position]')?.dataset.position) !== i
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
      for (const action of ['update-one', 'update-tenth', 'reverse', 'filter']) {
        for (let i = 0; i < iterations + warmup; i++) {
          const before = new Map(nodes().map((node) => [node.dataset.row, node]));
          if (action === 'update-one' || action === 'update-tenth')
            expected = expected.map((row, i) =>
              (action === 'update-one' ? i === 0 : i % 10 === 0)
                ? { ...row, label: row.label + '!' }
                : row,
            );
          else if (action === 'reverse') expected.reverse();
          else filtered = !filtered;
          const sample = await window.__bench.run(action).catch((error) => {
            throw new Error(`${action} iteration ${i}: ${error.message}`);
          });
          validate();
          for (const node of nodes())
            if (
              before.has(node.dataset.row) &&
              before.get(node.dataset.row) !== node
            )
              throw new Error(`Lost keyed identity: ${action}/${node.dataset.row}`);
          if (i >= warmup)
            samples.push({
              action:
                action === 'filter' ? (filtered ? 'filter' : 'restore') : action,
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
}

const browser = await chromium.launch({ headless: true });
report.environment.chromium = browser.version();
async function withPage(url, body) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    reducedMotion: 'reduce',
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await page.goto(url);
    await page.waitForFunction(
      () => Number.isFinite(window.__bench?.bootstrapMs),
      undefined,
      { timeout: 60000 },
    );
    const result = await body(page, cdp);
    assert.deepEqual(errors, [], `Page errors at ${url}`);
    return result;
  } finally {
    await context.close();
  }
}

const sha = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

try {
  // --- Contracts: reports, tags (with ordinals), replay targets, DOM shape,
  // then complete destruction. Every variant must match the reference.
  for (const scenario of contractCases) {
    let reference;
    for (const variant of variants) {
      const contract = await withPage(
        `${base}/${variant.label}/contracts/contracts/?rows=${scenario.rows}&indexes=${scenario.indexes}`,
        async (page) => {
          const mounted = await page.evaluate(() => window.__craftContracts());
          await exercise(page, scenario, 1, 0);
          const exercised = await page.evaluate(() => window.__craftContracts());
          await page.evaluate(() => window.__craftDestroy());
          const destroyed = await page.evaluate(() => ({
            rows: document.querySelectorAll('[data-row]').length,
            contracts: window.__craftContracts(),
          }));
          return { mounted, exercised, destroyed };
        },
      );
      assert.equal(contract.destroyed.rows, 0, `${variant.label}: rows left`);
      assert.equal(
        contract.destroyed.contracts.reports,
        0,
        `${variant.label}: reports left after destroy`,
      );
      const signature = {
        mountedReports: contract.mounted.reports,
        mountedTagsSha256: sha(contract.mounted.tags),
        mountedRowsSha256: sha(contract.mounted.rows),
        exercisedReports: contract.exercised.reports,
        exercisedTagsSha256: sha(contract.exercised.tags),
        exercisedRowsSha256: sha(contract.exercised.rows),
        descriptor: contract.exercised.descriptor,
        replay: contract.exercised.replay,
        rowReplay: [...new Set(contract.exercised.rows.map((row) => row?.[1]))],
        dom: contract.exercised.dom,
        destroyed: {
          rows: contract.destroyed.rows,
          reports: contract.destroyed.contracts.reports,
          replay: contract.destroyed.contracts.replay,
        },
      };
      report.contracts.push({ variant: variant.label, ...scenario, ...signature });
      if (!reference) {
        reference = { signature, contract };
        await writeFile(
          join(output, `contracts-reference-${scenario.rows}-${scenario.indexes}.json`),
          JSON.stringify(contract, null, 2) + '\n',
        );
      } else {
        if (sha(signature) !== sha(reference.signature))
          await writeFile(
            join(output, `contracts-${variant.label}-${scenario.rows}-${scenario.indexes}.json`),
            JSON.stringify(contract, null, 2) + '\n',
          );
        // A change that removes boundary comments on purpose compares
        // everything but their count, and says so.
        const comparable = (value) =>
          boundaryCommentsMayChange
            ? { ...value, dom: { ...value.dom, comment: undefined } }
            : value;
        assert.deepEqual(
          comparable(signature),
          comparable(reference.signature),
          `${variant.label}: contracts differ from ${variants[0].label}`,
        );
        if (
          boundaryCommentsMayChange &&
          signature.dom.comment !== reference.signature.dom.comment
        )
          console.log(
            `  comments ${reference.signature.dom.comment} -> ${signature.dom.comment} (RUNTIME_ONLY_COMMENTS_MAY_CHANGE)`,
          );
      }
      console.log(
        `contracts ${variant.label} rows=${scenario.rows} indexes=${scenario.indexes}: ${signature.mountedReports} reports, replay ${signature.replay}, identical`,
      );
    }
  }
  await save();

  // --- Counters: instrumented builds, after mount then after the actions.
  if (withCounts)
    for (const scenario of countCases)
      for (const variant of variants) {
        const counts = await withPage(
          `${base}/${variant.label}/counts/craft/?rows=${scenario.rows}&indexes=${scenario.indexes}`,
          async (page) => {
            const mount = await page.evaluate(() => ({ ...window.__craftCounts }));
            await exercise(page, scenario, 1, 0);
            const total = await page.evaluate(() => ({ ...window.__craftCounts }));
            return { mount, total };
          },
        );
        report.counts.push({ variant: variant.label, ...scenario, ...counts });
        console.log(
          `counts ${variant.label} rows=${scenario.rows} indexes=${scenario.indexes}: ${JSON.stringify(counts.mount)}`,
        );
      }
  await save();

  // --- Timing and heap.
  if (!skipTiming)
    for (const scenario of cases)
      for (let run = 0; run < runs; run++)
        for (const variant of shuffled(variants)) {
          const sample = await withPage(
            `${base}/${variant.label}/timing/craft/?rows=${scenario.rows}&indexes=${scenario.indexes}`,
            async (page, cdp) => {
              const startup = await page.evaluate(() => ({
                bootstrapMs: window.__bench.bootstrapMs,
                // performance.now() when begin() ran: module loading and
                // initialisation, from the navigation's time origin.
                moduleReadyMs: window.__bench.started,
              }));
              const actions = await exercise(page, scenario, iterations, warmup);
              await cdp.send('HeapProfiler.collectGarbage');
              const memory = {
                ...(await cdp.send('Runtime.getHeapUsage')),
                ...(await cdp.send('Memory.getDOMCounters')),
              };
              return { startup, actions, memory };
            },
          );
          report.samples.push({ variant: variant.label, ...scenario, run, ...sample });
          await save();
          console.log(
            `${variant.label} rows=${scenario.rows} indexes=${scenario.indexes} run=${run + 1}: mount ${sample.startup.bootstrapMs.toFixed(1)}ms, heap ${(sample.memory.usedSize / 2 ** 20).toFixed(2)}MiB`,
          );
        }

  // --- Summary.
  const stats = (values) => {
    const v = [...values].sort((a, b) => a - b),
      n = v.length;
    const q = (p) => {
      const at = (n - 1) * p,
        lo = Math.floor(at),
        hi = Math.ceil(at);
      return v[lo] + (v[hi] - v[lo]) * (at - lo);
    };
    return { n, median: q(0.5), p25: q(0.25), p75: q(0.75), min: v[0], max: v[n - 1] };
  };
  const metrics = [
    ['mount', (s) => [s.startup.bootstrapMs]],
    ['moduleReady', (s) => [s.startup.moduleReadyMs]],
    ...['update-one', 'update-tenth', 'reverse', 'filter', 'restore'].map(
      (action) => [
        action,
        (s) => s.actions.filter((a) => a.action === action).map((a) => a.domMs),
      ],
    ),
    ['heapMiB', (s) => [s.memory.usedSize / 2 ** 20]],
  ];
  report.summary = [];
  for (const scenario of skipTiming ? [] : cases) {
    const row = { ...scenario, metrics: {} };
    for (const [metric, pick] of metrics) {
      row.metrics[metric] = {};
      for (const variant of variants)
        row.metrics[metric][variant.label] = stats(
          report.samples
            .filter(
              (s) =>
                s.variant === variant.label &&
                s.rows === scenario.rows &&
                s.indexes === scenario.indexes,
            )
            .flatMap(pick),
        );
      const ref = row.metrics[metric][variants[0].label].median;
      for (const variant of variants.slice(1))
        row.metrics[metric][variant.label].changeVsReference =
          (row.metrics[metric][variant.label].median - ref) / ref;
    }
    report.summary.push(row);
  }
  report.status = 'complete';
  for (const row of report.summary) {
    console.log(`\nrows=${row.rows} indexes=${row.indexes} (median, change vs ${variants[0].label})`);
    for (const [metric, byVariant] of Object.entries(row.metrics))
      console.log(
        `  ${metric.padEnd(13)} ` +
          variants
            .map(({ label }) => {
              const m = byVariant[label];
              const change =
                m.changeVsReference === undefined
                  ? ''
                  : ` (${m.changeVsReference >= 0 ? '+' : ''}${(m.changeVsReference * 100).toFixed(1)}%)`;
              return `${label} ${m.median.toFixed(2)}${change}`;
            })
            .join(' | '),
      );
  }
  for (const variant of report.variants)
    console.log(
      `bundle ${variant.label}: ${variant.bundle.minifiedBytes} B minified, ${variant.bundle.gzipBytes} B gzip`,
    );
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  throw error;
} finally {
  await save();
  await browser.close();
  await new Promise((done) => server.close(done));
}
console.log(`Report: ${join(output, 'report.json')}`);
