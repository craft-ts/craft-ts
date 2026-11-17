// Named CPU samples for the realistic page, separate from timing builds.
// npm run compiler:build
// COMPILER_PROFILE_LIB_ROOT=/frozen/runtime node apps/compiler-benchmark/profile.mjs
import assert from 'node:assert/strict';
import { build, preview } from 'vite';
import { chromium } from '@playwright/test';
import { join, resolve } from 'node:path';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { craftCompiler } from '../../dist/libs/compiler/src/vite.js';
const root = resolve(fileURLToPath(new URL('../..', import.meta.url))),
  app = join(root, 'apps/framework-benchmark');
const output = resolve(
  root,
  process.env.COMPILER_PROFILE_OUTPUT ?? 'tmp/compiler-profile',
);
const libraryRoot = resolve(root, process.env.COMPILER_PROFILE_LIB_ROOT ?? '.');
const runs = Number(process.env.COMPILER_PROFILE_RUNS ?? 3),
  scale = Number(process.env.COMPILER_PROFILE_SCALE ?? 2),
  cpu = Number(process.env.COMPILER_PROFILE_CPU ?? 4);
assert(
  Number.isInteger(runs) && runs > 0 && [1, 2, 4].includes(scale) && cpu >= 1,
);
await mkdir(output, { recursive: true });
const sourceSha256 = Object.fromEntries(
  await Promise.all(
    [
      'libs/component/src/lib/render/interpreter.ts',
      'libs/core/src/lib/lifecycle.ts',
      'libs/core/src/lib/craft-generator-runtime.ts',
    ].map(async (file) => [
      file,
      createHash('sha256')
        .update(await readFile(join(libraryRoot, file)))
        .digest('hex'),
    ]),
  ),
);

await build({
  configFile: join(app, 'vite.config.mjs'),
  logLevel: 'error',
  plugins: [
    // COMPILER_PROFILE_OPTIONS='{"lean":true}' profiles another compiler mode.
    craftCompiler(JSON.parse(process.env.COMPILER_PROFILE_OPTIONS ?? '{}')),
    {
      name: 'profile-gate',
      enforce: 'pre',
      transform(code, id) {
        if (id.endsWith('/src/craft-page/main.ts')) {
          assert.equal(code.split('begin();').length, 2);
          return code.replace(
            'begin();',
            'await new Promise<void>(resolve => { (globalThis as any).__releaseMount = resolve; });\nbegin();',
          );
        }
      },
    },
  ],
  resolve: {
    alias: [
      {
        find: '@craft-ts/component/compiler-runtime',
        replacement: join(
          libraryRoot,
          'libs/component/src/compiler-runtime.ts',
        ),
      },
      ...['core', 'component', 'style'].map((name) => ({
        find: '@craft-ts/' + name,
        replacement: join(libraryRoot, 'libs/' + name + '/src/index.ts'),
      })),
    ],
  },
  build: {
    outDir: join(output, 'profile-dist'),
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
    rolldownOptions: {
      input: { 'craft-page': join(app, 'craft-page/index.html') },
    },
  },
});
const server = await preview({
    configFile: join(app, 'vite.config.mjs'),
    logLevel: 'error',
    build: { outDir: join(output, 'profile-dist') },
  }),
  browser = await chromium.launch({ headless: true }),
  report = [];
try {
  for (let run = 0; run < runs; run++) {
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      }),
      page = await context.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await page.goto(
      `http://127.0.0.1:${server.httpServer.address().port}/craft-page/?scale=${scale}`,
    );
    await page.waitForFunction(
      () => typeof globalThis.__releaseMount === 'function',
    );
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
    for (const phase of ['mount', 'theme', 'filter']) {
      await cdp.send('Profiler.start');
      if (phase === 'mount') {
        await page.evaluate(() => globalThis.__releaseMount());
        await page.waitForFunction(() =>
          Number.isFinite(window.__bench.bootstrapMs),
        );
      } else await page.evaluate((action) => window.__bench.run(action), phase);
      const { profile } = await cdp.send('Profiler.stop');
      await writeFile(
        join(output, `${phase}-${run}.cpuprofile`),
        JSON.stringify(profile),
      );
      const byId = new Map(profile.nodes.map((n) => [n.id, n])),
        totals = new Map();
      for (let i = 0; i < profile.samples.length; i++) {
        const frame = byId.get(profile.samples[i]).callFrame,
          key = JSON.stringify({
            name: frame.functionName,
            file: frame.url.split('/').pop(),
            line: frame.lineNumber + 1,
          });
        totals.set(
          key,
          (totals.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000,
        );
      }
      report.push({
        run,
        phase,
        self: [...totals]
          .map(([key, ms]) => ({ ...JSON.parse(key), ms }))
          .sort((a, b) => b.ms - a.ms),
      });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((done) => server.httpServer.close(done));
}
await writeFile(
  join(output, 'profile-summary.json'),
  JSON.stringify(
    {
      options: { runs, scale, cpu, libraryRoot },
      sourceSha256,
      profiles: report,
      note: 'Named samples in an unminified production build. Profiling and throttling overhead mean these are not timing comparisons or exact attribution percentages.',
    },
    null,
    2,
  ) + '\n',
);
for (const phase of ['mount', 'theme', 'filter']) {
  const totals = new Map();
  for (const row of report.filter((r) => r.phase === phase))
    for (const item of row.self) {
      const key = item.name + ' (' + item.line + ')';
      totals.set(key, (totals.get(key) ?? 0) + item.ms);
    }
  console.log(phase, [...totals].sort((a, b) => b[1] - a[1]).slice(0, 24));
}
