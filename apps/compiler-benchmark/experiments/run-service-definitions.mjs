import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { cpus } from 'node:os';
import { build, preview } from 'vite';
import { chromium } from '@playwright/test';
import { prepareCandidate, lab, workspace } from './prepare.mjs';
const before = 'service-registration-before',
  after = 'ablation-full';
try {
  await readFile(join(lab, 'roots', before, 'candidate.json'));
} catch {
  await prepareCandidate(before);
}
const output = join(lab, 'service-definitions'),
  app = join(output, 'app');
await mkdir(app, { recursive: true });
const fixture = `import {craftService,craftExpose} from '@craft-ts/core';
let retained:unknown[]=[];let factories=0;
function declare(prefix:string,count:number){
  const started=performance.now();let checksum=0;retained=[];
  for(let index=0;index<count;index++){
    const name=prefix+index;
    const api=craftService({name,providedIn:'global'},function*(){factories++;yield* craftExpose('value',0);});
    if(typeof Reflect.get(api,name)!=='function')throw Error('Missing helper');
    retained.push(api);checksum++;
  }
  return {ms:performance.now()-started,checksum,retained:retained.length,factories};
}
(window as any).__definitions={ready:true,warm(){declare('WarmOne',250);declare('WarmTwo',250);retained=[];},run(count:number){return declare('Measured',count);}};
`;
await writeFile(join(app, 'main.ts'), fixture);
await writeFile(
  join(app, 'index.html'),
  '<html><body><script type="module" src="/main.ts"></script></body></html>',
);
const hash = (source) => createHash('sha256').update(source).digest('hex');
const servers = new Map(),
  builds = {},
  raw = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const id of [before, after]) {
    const root = join(lab, 'roots', id),
      dist = join(output, 'dist', id);
    await build({
      configFile: false,
      root: app,
      logLevel: 'error',
      resolve: {
        alias: [
          {
            find: '@craft-ts/core',
            replacement: join(root, 'libs/core/src/index.ts'),
          },
        ],
      },
      build: {
        outDir: dist,
        minify: 'oxc',
        target: 'es2022',
        emptyOutDir: true,
      },
    });
    const js = [];
    for (const name of await readdir(join(dist, 'assets')))
      if (name.endsWith('.js'))
        js.push({ name, content: await readFile(join(dist, 'assets', name)) });
    builds[id] = {
      js: js.reduce((n, x) => n + x.content.length, 0),
      gzip: js.reduce((n, x) => n + gzipSync(x.content).length, 0),
      artifacts: js.map((x) => ({ file: x.name, sha256: hash(x.content) })),
      coreServiceSha256: hash(
        await readFile(join(root, 'libs/core/src/lib/craft-service.ts')),
      ),
    };
    servers.set(
      id,
      await preview({
        configFile: false,
        root: app,
        logLevel: 'error',
        build: { outDir: dist },
        preview: { host: '127.0.0.1', port: 0 },
      }),
    );
  }
  const blocks = Array.from({ length: 8 }, (_, run) =>
    run % 2
      ? [
          { id: after, run },
          { id: before, run },
        ]
      : [
          { id: before, run },
          { id: after, run },
        ],
  );
  let seed = 17112026;
  for (let i = blocks.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((seed / 2 ** 32) * (i + 1));
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  }
  for (const job of blocks.flat()) {
    const context = await browser.newContext(),
      page = await context.newPage(),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(
      'http://127.0.0.1:' + servers.get(job.id).httpServer.address().port + '/',
    );
    await page.waitForFunction(() => window.__definitions?.ready);
    await page.evaluate(() => window.__definitions.warm());
    const cdp = await context.newCDPSession(page);
    await cdp.send('HeapProfiler.collectGarbage');
    const heapBefore = (await cdp.send('Runtime.getHeapUsage')).usedSize;
    const result = await page.evaluate(() => window.__definitions.run(2000));
    assert.equal(result.checksum, 2000);
    assert.equal(result.retained, 2000);
    assert.equal(result.factories, 0);
    assert.deepEqual(errors, []);
    await cdp.send('HeapProfiler.collectGarbage');
    raw.push({
      ...job,
      ...result,
      retainedBytes:
        (await cdp.send('Runtime.getHeapUsage')).usedSize - heapBefore,
    });
    await context.close();
  }
  const median = (values) => {
    const v = values.toSorted((a, b) => a - b),
      m = v.length >> 1;
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  };
  const summary = [before, after].map((id) => {
    const rows = raw.filter((row) => row.id === id);
    return {
      id,
      ms: median(rows.map((row) => row.ms)),
      retainedBytes: median(rows.map((row) => row.retainedBytes)),
    };
  });
  await writeFile(
    join(output, 'results.json'),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        fixture,
        fixtureSha256: hash(fixture),
        environment: {
          node: process.version,
          cpu: cpus()[0].model,
          chromium: browser.version(),
        },
        count: 2000,
        warmup: 500,
        runs: 8,
        compiler: false,
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
