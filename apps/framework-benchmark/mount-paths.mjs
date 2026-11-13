#!/usr/bin/env node
// Pairwise mount diagnosis only. Probe code is injected into isolated builds.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { build, preview } from 'vite';
import { chromium } from '@playwright/test';

const app = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(app, '../..');
const output = resolve(
  workspace,
  process.env.MOUNT_PATHS_OUTPUT ?? 'tmp/foldkit-mount-paths',
);
const staging = process.env.MOUNT_PATHS_MODE === 'staging';
await mkdir(output, { recursive: true });
const definitions = staging
  ? [
      { name: 'craft', framework: 'craft' },
      { name: 'craft-staged', framework: 'craft', staged: true },
    ]
  : [
      { name: 'craft', framework: 'craft' },
      { name: 'foldkit', framework: 'foldkit' },
      { name: 'foldkit-phases', framework: 'foldkit', phases: true },
      { name: 'foldkit-no-memo', framework: 'foldkit', noMemo: true },
      { name: 'craft-profile', framework: 'craft', profile: true },
      { name: 'foldkit-profile', framework: 'foldkit', profile: true },
    ];
const servers = new Map();
const sourceHashes = {};
for (const name of ['craft', 'foldkit']) {
  const path = join(app, 'src', name, 'main.ts');
  sourceHashes[name] = createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}
const report = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: workspace,
    encoding: 'utf8',
  }).trim(),
  measuredAt: new Date().toISOString(),
  mode: staging ? 'staging' : 'paths',
  environment: { node: process.version, cpu: cpus()[0].model },
  sourceHashes,
  protocol: {
    mountTiming:
      'production minified, 3 fresh contexts per framework/size, interleaved; DOM notification before paint',
    counts:
      'separate navigations with native DOM wrappers; their timings are not ranked',
    phases:
      'separate Foldkit build using public slow hooks; not mixed into baseline results',
    noMemo:
      'only keyed memo call replaced by direct rowView, separate production build',
    cpuProfiles:
      'separate unminified production builds, mount gated after imports, 5000 rows CPU x4, 3 profiles per framework; no ranking from profile timings',
  },
  samples: [],
  counts: [],
  phases: [],
  noMemo: [],
  profiles: [],
};
const save = () =>
  writeFile(
    join(output, 'results.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
let browser;
try {
  // Complete all builds before any measurement.
  for (const definition of definitions) {
    const configName =
      definition.framework === 'foldkit'
        ? 'foldkit.vite.config.mjs'
        : 'vite.config.mjs';
    const { default: base } = await import(
      pathToFileURL(join(app, configName)).href +
        `?mount-paths=${definition.name}`
    );
    const plugins = [...base.plugins];
    if (
      definition.phases ||
      definition.noMemo ||
      definition.profile ||
      definition.staged
    ) {
      plugins.unshift({
        name: `mount-probe-${definition.name}`,
        enforce: 'pre',
        transform(code, id) {
          if (
            id.split('?')[0] !==
            join(app, 'src', definition.framework, 'main.ts')
          )
            return;
          let changed = code;
          if (definition.phases) {
            const needle = '    Model,';
            assert.equal(changed.split(needle).length, 2);
            changed = changed.replace(
              needle,
              `${needle}
    slow: {
      show: 'Always', measuredPhases: ['View', 'Patch'],
      thresholdOverrides: { View: -1, Patch: -1 },
      onSlow: (context) => { (globalThis.__mountPhases ??= []).push({ phase: context._tag, ms: context.durationMs }); },
    },`,
            );
          }
          if (definition.noMemo) {
            const needle =
              'lazyRow(row.id, rowView, [row, settings.indexes ? position : 0, h])';
            assert.equal(changed.split(needle).length, 2);
            changed = changed.replace(
              needle,
              'rowView(row, settings.indexes ? position : 0, h)',
            );
          }
          if (definition.profile) {
            assert.equal(changed.split('begin();').length, 2);
            changed = changed.replace(
              'begin();',
              'await new Promise((release) => { globalThis.__releaseMount = release; });\nbegin();',
            );
          }
          if (definition.staged) {
            const host = "host: document.getElementById('mount')!";
            assert.equal(changed.split(host).length, 2);
            assert.equal(changed.split('begin();').length, 2);
            changed = changed.replace(host, 'host: detachedMount');
            changed = changed.replace(
              'begin();',
              `begin();
const detachedMount = document.getElementById('mount');
const mountPlaceholder = document.createComment('diagnostic-staging');
detachedMount.replaceWith(mountPlaceholder);`,
            );
            changed += '\nmountPlaceholder.replaceWith(detachedMount);\n';
          }
          return { code: changed, map: null };
        },
      });
    }
    const config = {
      ...base,
      configFile: false,
      logLevel: 'error',
      plugins,
      build: {
        ...base.build,
        outDir: join(output, 'builds', definition.name),
        minify: definition.profile ? false : 'oxc',
        sourcemap: !!definition.profile,
        rolldownOptions: {
          input: join(app, definition.framework, 'index.html'),
        },
      },
    };
    await build(config);
    const server = await preview(config);
    servers.set(definition.name, {
      server,
      url: `http://127.0.0.1:${server.httpServer.address().port}`,
    });
  }
  browser = await chromium.launch({ headless: true });
  report.environment.chromium = browser.version();

  async function measure(name, rows, options = {}) {
    const definition = definitions.find((d) => d.name === name);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      reducedMotion: 'reduce',
    });
    try {
      if (options.counts)
        await context.addInitScript(() => {
          const counts = (globalThis.__domMountCounts = {});
          const active = () =>
            Number.isFinite(window.__bench?.started) &&
            !Number.isFinite(window.__bench?.bootstrapMs);
          for (const [prototype, names] of [
            [
              Document.prototype,
              [
                'createElement',
                'createElementNS',
                'createTextNode',
                'createComment',
                'createDocumentFragment',
              ],
            ],
            [
              Node.prototype,
              ['appendChild', 'insertBefore', 'replaceChild', 'removeChild'],
            ],
            [Element.prototype, ['setAttribute', 'removeAttribute']],
          ])
            for (const key of names) {
              const original = prototype[key];
              prototype[key] = function (...args) {
                if (active()) {
                  counts[key] = (counts[key] ?? 0) + 1;
                  if (this.isConnected)
                    counts[`${key}:connected`] =
                      (counts[`${key}:connected`] ?? 0) + 1;
                }
                return Reflect.apply(original, this, args);
              };
            }
        });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', {
        rate: options.profile ? 4 : 1,
      });
      await page.goto(
        `${servers.get(name).url}/${definition.framework}/?rows=${rows}&indexes=false`,
      );
      if (options.profile) {
        await page.waitForFunction(
          () => typeof globalThis.__releaseMount === 'function',
        );
        await cdp.send('Profiler.enable');
        await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
        await cdp.send('Profiler.start');
        await page.evaluate(() => globalThis.__releaseMount());
      }
      await page.waitForFunction(() =>
        Number.isFinite(window.__bench?.bootstrapMs),
      );
      let profile;
      if (options.profile) ({ profile } = await cdp.send('Profiler.stop'));
      const state = await page.evaluate((rows) => {
        const actual = [...document.querySelectorAll('[data-row]')];
        if (actual.length !== rows) throw new Error('Wrong count');
        actual.forEach((node, i) => {
          if (node.dataset.row !== String(i) || node.textContent !== `Row ${i}`)
            throw new Error(`Wrong row ${i}`);
        });
        const nodes = { element: 0, text: 0, comment: 0 };
        const walker = document.createTreeWalker(
          document.querySelector('#mount'),
          NodeFilter.SHOW_ALL,
        );
        while (walker.nextNode()) {
          const key = { 1: 'element', 3: 'text', 8: 'comment' }[
            walker.currentNode.nodeType
          ];
          if (key) nodes[key]++;
        }
        return {
          bootstrapMs: window.__bench.bootstrapMs,
          dom: nodes,
          nativeCounts: globalThis.__domMountCounts,
          phases: globalThis.__mountPhases,
          checks: { data: true, order: true, pageErrors: 0 },
        };
      }, rows);
      assert.deepEqual(errors, []);
      await cdp.send('HeapProfiler.collectGarbage');
      const memory = await cdp.send('Runtime.getHeapUsage');
      if (profile) {
        const path = `${name}-${options.run}.cpuprofile`;
        await writeFile(join(output, path), JSON.stringify(profile));
        const byId = new Map(profile.nodes.map((n) => [n.id, n]));
        const times = new Map();
        profile.samples.forEach((id, i) => {
          const frame = byId.get(id).callFrame;
          const key = JSON.stringify({
            name: frame.functionName,
            file: frame.url.split('/').pop(),
            line: frame.lineNumber + 1,
          });
          times.set(key, (times.get(key) ?? 0) + profile.timeDeltas[i] / 1000);
        });
        state.profile = path;
        state.self = [...times]
          .map(([key, ms]) => ({ ...JSON.parse(key), ms }))
          .sort((a, b) => b.ms - a.ms);
      }
      return {
        name,
        framework: definition.framework,
        rows,
        ...state,
        heapMiB: memory.usedSize / 1024 ** 2,
      };
    } finally {
      await context.close();
    }
  }

  if (staging) {
    for (const rows of [1000, 5000])
      for (let run = 0; run < 5; run++) {
        for (const name of run % 2
          ? ['craft-staged', 'craft']
          : ['craft', 'craft-staged']) {
          const sample = { ...(await measure(name, rows)), run };
          report.samples.push(sample);
          await save();
          console.log(
            `${name} ${rows} run=${run + 1}: ${sample.bootstrapMs.toFixed(2)} ms; data valid`,
          );
        }
      }
    for (const rows of [1000, 5000])
      for (const name of ['craft', 'craft-staged']) {
        report.counts.push(await measure(name, rows, { counts: true }));
        await save();
      }
    assert.equal(report.samples.length, 20);
    assert.equal(report.counts.length, 4);
  } else {
    for (const rows of [1000, 5000])
      for (let run = 0; run < 3; run++) {
        // Reverse the initial order between sizes and alternate each run.
        const names =
          (run + (rows === 5000 ? 1 : 0)) % 2
            ? ['foldkit', 'craft']
            : ['craft', 'foldkit'];
        for (const name of names) {
          const sample = { ...(await measure(name, rows)), run };
          report.samples.push(sample);
          await save();
          console.log(
            `${name} ${rows} run=${run + 1}: ${sample.bootstrapMs.toFixed(2)} ms; data valid`,
          );
        }
      }
    for (const rows of [1000, 5000])
      for (const name of ['craft', 'foldkit']) {
        report.counts.push(await measure(name, rows, { counts: true }));
        await save();
      }
    for (const rows of [1000, 5000])
      for (let run = 0; run < 3; run++) {
        report.phases.push({ ...(await measure('foldkit-phases', rows)), run });
        report.noMemo.push({
          ...(await measure('foldkit-no-memo', rows)),
          run,
        });
        await save();
      }
    for (let run = 0; run < 3; run++)
      for (const name of ['craft-profile', 'foldkit-profile']) {
        const sample = {
          ...(await measure(name, 5000, { profile: true, run })),
          run,
        };
        report.profiles.push(sample);
        await save();
        console.log(
          `${name} profile ${run + 1}: ${sample.self
            .slice(0, 5)
            .map((x) => `${x.name}=${x.ms.toFixed(1)}ms`)
            .join(', ')}`,
        );
      }
    assert.equal(report.samples.length, 12);
    assert.equal(report.counts.length, 4);
    assert.equal(report.phases.length, 6);
    assert.equal(report.noMemo.length, 6);
    assert.equal(report.profiles.length, 6);
  }
  report.status = 'complete';
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  throw error;
} finally {
  await browser?.close();
  for (const { server } of servers.values())
    await new Promise((r) => server.httpServer.close(r));
  await save();
}
console.log(`Report: ${output}/results.json`);
