import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { cpus } from 'node:os';
import { build, preview } from 'vite';
import { chromium } from '@playwright/test';
import { lab, workspace, baseCommit } from './prepare.mjs';
const ids = process.argv.slice(2);
assert(ids.length);
const out = join(lab, 'services-focused');
const app = join(out, 'app');
await mkdir(app, { recursive: true });
const fixture = await readFile(
  new URL('./services.fixture.ts', import.meta.url),
  'utf8',
);
await writeFile(join(app, 'main.ts'), fixture);
await writeFile(
  join(app, 'index.html'),
  '<html><body><script type="module" src="/main.ts"></script></body></html>',
);
const servers = new Map(),
  builds = {},
  raw = [];
const browser = await chromium.launch({
  headless: true,
  args: ['--js-flags=--expose-gc'],
});
const median = (values) =>
  [...values].sort((a, b) => a - b)[values.length >> 1];
try {
  for (const id of ids) {
    const root = join(lab, 'roots', id),
      dist = join(out, 'dist', id);
    const started = performance.now();
    await build({
      configFile: false,
      root: app,
      logLevel: 'error',
      resolve: {
        alias: [
          {
            find: '@campaign/generator-runtime',
            replacement: join(
              root,
              'libs/core/src/lib/craft-generator-runtime.ts',
            ),
          },
          ...['core', 'component', 'style'].map((name) => ({
            find: '@craft-ts/' + name,
            replacement: join(root, 'libs', name, 'src/index.ts'),
          })),
        ],
      },
      build: {
        outDir: dist,
        emptyOutDir: true,
        minify: 'oxc',
        target: 'es2022',
      },
    });
    const ms = performance.now() - started;
    const js = [];
    for (const f of await readdir(join(dist, 'assets')))
      if (f.endsWith('.js')) js.push(await readFile(join(dist, 'assets', f)));
    builds[id] = {
      ms,
      js: js.reduce((n, b) => n + b.length, 0),
      gzip: js.reduce((n, b) => n + gzipSync(b).length, 0),
      sha256: js.map((b) => createHash('sha256').update(b).digest('hex')),
    };
    const server = await preview({
      configFile: false,
      root: app,
      logLevel: 'error',
      build: { outDir: dist },
      preview: { host: '127.0.0.1', port: 0 },
    });
    servers.set(id, server);
  }
  const jobs = [];
  for (let run = 0; run < 7; run++)
    for (const id of ids)
      for (const wrapped of [false, true]) jobs.push({ id, run, wrapped });
  let seed = 17112026;
  for (let i = jobs.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((seed / 2 ** 32) * (i + 1));
    [jobs[i], jobs[j]] = [jobs[j], jobs[i]];
  }
  for (const job of jobs) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(
      'http://127.0.0.1:' +
        servers.get(job.id).httpServer.address().port +
        '/?wrapped=' +
        job.wrapped,
    );
    await page.waitForFunction(() => window.__serviceCampaign?.ready);
    const cdp = await context.newCDPSession(page);
    await cdp.send('HeapProfiler.collectGarbage');
    const heapBefore = (await cdp.send('Runtime.getHeapUsage')).usedSize;
    const samples = {};
    for (const kind of ['request', 'resolve', 'shortcut']) {
      samples[kind] = [];
      for (let loop = 0; loop < 7; loop++) {
        const result = await page.evaluate(
          ({ kind, count }) => window.__serviceCampaign.run(kind, count),
          { kind, count: 10000 },
        );
        if (loop >= 2) samples[kind].push(result.ms);
      }
    }
    await cdp.send('HeapProfiler.collectGarbage');
    const retained =
      (await cdp.send('Runtime.getHeapUsage')).usedSize - heapBefore;
    assert.deepEqual(errors, []);
    raw.push({
      ...job,
      samples,
      retained,
      medians: Object.fromEntries(
        Object.entries(samples).map(([k, v]) => [k, median(v)]),
      ),
    });
    await context.close();
    if (raw.length % 10 === 0)
      console.log(raw.length + '/' + jobs.length + ' service navigations');
  }
  const summary = [];
  for (const id of ids)
    for (const wrapped of [false, true]) {
      const rows = raw.filter((r) => r.id === id && r.wrapped === wrapped);
      summary.push({
        id,
        wrapped,
        ...Object.fromEntries(
          ['request', 'resolve', 'shortcut'].map((k) => [
            k,
            median(rows.map((r) => r.medians[k])),
          ]),
        ),
        retainedBytes: median(rows.map((r) => r.retained)),
      });
    }
  await writeFile(
    join(out, 'results.json'),
    JSON.stringify(
      {
        baseCommit,
        timestamp: new Date().toISOString(),
        node: process.version,
        cpu: cpus()[0].model,
        chromium: browser.version(),
        runs: 7,
        iterations: 5,
        count: 10000,
        fixture,
        builds,
        summary,
        raw,
      },
      null,
      2,
    ) + '\n',
  );
  console.table(summary);
} finally {
  await browser.close();
  for (const server of servers.values())
    await new Promise((done) => server.httpServer.close(done));
}
