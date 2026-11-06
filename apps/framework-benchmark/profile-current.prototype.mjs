import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  symlink,
  rm,
} from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { build, preview } from './node_modules/vite/dist/node/index.js';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const workspace = process.cwd(),
  output = resolve(
    process.env.CRAFT_PROFILE_OUTPUT ?? 'tmp/mount-more/profile',
  );
await mkdir(output, { recursive: true });
const scratch = await mkdtemp(resolve('tmp/remaining-profile-'));
for (const path of [
  'libs/core',
  'libs/component',
  'libs/style',
  'libs/test-type',
  'apps/framework-benchmark',
  'tsconfig.base.json',
  'package.json',
])
  await cp(resolve(path), join(scratch, path), {
    recursive: true,
    filter: (source) =>
      !source
        .split('/')
        .some((p) => ['node_modules', 'dist', 'dist-foldkit'].includes(p)),
  });
await symlink(resolve('node_modules'), join(scratch, 'node_modules'));
await symlink(
  resolve('apps/framework-benchmark/node_modules'),
  join(scratch, 'apps/framework-benchmark/node_modules'),
);
const timing = JSON.parse(
  await readFile(
    process.env.CRAFT_PROFILE_REPORT ?? 'tmp/mount-next/prepared/timing.json',
    'utf8',
  ),
);
const variant = timing.variants.find(
  (x) => x.name === (process.env.CRAFT_PROFILE_VARIANT ?? 'next-all'),
);
for (const path of variant.modified)
  await cp(
    resolve(
      process.env.CRAFT_PROFILE_SOURCES ??
        'tmp/mount-next/prepared/prototypes/next-all',
      path,
    ),
    join(scratch, path),
  );
const main = join(scratch, 'apps/framework-benchmark/src/craft/main.ts');
const source = await readFile(main, 'utf8');
assert.equal(source.split('begin();').length, 2);
await writeFile(
  main,
  source.replace(
    'begin();',
    'await new Promise(release => { globalThis.__releaseMount = release; });\nbegin();',
  ),
);
const configFile = join(scratch, 'apps/framework-benchmark/vite.config.mjs');
const dist = join(output, 'dist');
await build({
  configFile,
  logLevel: 'error',
  build: {
    outDir: dist,
    minify: false,
    sourcemap: true,
    rolldownOptions: {
      input: join(scratch, 'apps/framework-benchmark/craft/index.html'),
    },
  },
});
const server = await preview({
  configFile,
  logLevel: 'error',
  build: { outDir: dist },
});
const browser = await chromium.launch({ headless: true });
const report = {
  variant: variant.name,
  sourceSha256: variant.sourceSha256,
  note: 'Named CPU samples, unminified production build; imports finish before gate. 5000 rows no index CPU x4. Not timing comparisons or exact attribution percentages.',
  profiles: [],
};
try {
  for (let run = 0; run < 3; run++) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(
      `http://127.0.0.1:${server.httpServer.address().port}/craft/?rows=5000&indexes=false`,
    );
    await page.waitForFunction(
      () => typeof globalThis.__releaseMount === 'function',
    );
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
    await cdp.send('Profiler.start');
    await page.evaluate(() => globalThis.__releaseMount());
    await page.waitForFunction(() =>
      Number.isFinite(window.__bench?.bootstrapMs),
    );
    const { profile } = await cdp.send('Profiler.stop');
    const valid = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('[data-row]')];
      return (
        nodes.length === 5000 &&
        nodes.every(
          (e, i) => e.dataset.row === String(i) && e.textContent === `Row ${i}`,
        )
      );
    });
    assert(valid);
    assert.deepEqual(errors, []);
    await writeFile(join(output, `${run}.cpuprofile`), JSON.stringify(profile));
    const byId = new Map(profile.nodes.map((n) => [n.id, n])),
      totals = new Map();
    profile.samples.forEach((id, i) => {
      const f = byId.get(id).callFrame;
      const key = JSON.stringify({
        name: f.functionName,
        file: f.url.split('/').pop(),
        line: f.lineNumber + 1,
      });
      totals.set(key, (totals.get(key) ?? 0) + profile.timeDeltas[i] / 1000);
    });
    report.profiles.push({
      run,
      self: [...totals]
        .map(([key, ms]) => ({ ...JSON.parse(key), ms }))
        .sort((a, b) => b.ms - a.ms),
    });
    await context.close();
  }
  report.status = 'complete';
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
  await writeFile(
    join(output, 'summary.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await rm(scratch, { recursive: true, force: true });
}
const totals = new Map();
for (const p of report.profiles)
  for (const x of p.self) totals.set(x.name, (totals.get(x.name) ?? 0) + x.ms);
console.log([...totals].sort((a, b) => b[1] - a[1]).slice(0, 35));
