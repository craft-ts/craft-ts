#!/usr/bin/env node
// PROTOTYPE: explicit update fanout, separate from list throughput measurements.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, preview } from 'vite';
import { chromium } from '@playwright/test';

const app = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(app, '../..');
const output = resolve(
  workspace,
  process.env.COMPONENT_FANOUT_OUTPUT ?? 'tmp/component-granularity/fanout',
);
await mkdir(output, { recursive: true });
const { default: base } = await import(
  pathToFileURL(join(app, 'vite.config.mjs')).href
);
const config = {
  ...base,
  configFile: false,
  logLevel: 'error',
  build: {
    ...base.build,
    outDir: join(output, 'dist'),
    rolldownOptions: { input: join(app, 'craft-component-fanout/index.html') },
  },
};
await build(config);
const server = await preview(config);
const browser = await chromium.launch({ headless: true });
const report = {
  chromium: browser.version(),
  note: 'Synchronous prototype; counter probes separate from timing. Not field INP or archive replay certification.',
  samples: [],
  counters: [],
  crossStrategyTargets: [],
};
const save = () =>
  writeFile(
    join(output, 'results.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
const savedTargets = new Map();
try {
  for (const count of [32, 128])
    for (let run = 0; run < 4; run++) {
      // run=3 enables read counters and is excluded from timing aggregates.
      const counters = run === 3;
      for (const strategy of run % 2
        ? ['component', 'binding']
        : ['binding', 'component']) {
        const context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          reducedMotion: 'reduce',
        });
        try {
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.goto(
            `http://127.0.0.1:${server.httpServer.address().port}/craft-component-fanout/?fields=${count}&strategy=${strategy}&counts=${counters}`,
          );
          await page.waitForFunction(() =>
            Number.isFinite(globalThis.__componentFanout?.bootstrapMs),
          );
          const mountMs = await page.evaluate(
            () => globalThis.__componentFanout.bootstrapMs,
          );
          const targets = await page.evaluate(() =>
            globalThis.__componentFanout.targets(),
          );
          assert.equal(targets.length, count);
          assert(targets.every(Boolean));
          const key = `${count}/${strategy}`;
          const other = `${count}/${strategy === 'binding' ? 'component' : 'binding'}`;
          if (savedTargets.has(other)) {
            const resolution = await page.evaluate(
              (targets) => globalThis.__componentFanout.resolve(targets),
              savedTargets.get(other),
            );
            assert.deepEqual(
              resolution,
              Array.from({ length: count }, (_, i) => ({
                status: 'resolved',
                field: String(i),
              })),
            );
            assert.deepEqual(targets, savedTargets.get(other));
            report.crossStrategyTargets.push({
              fields: count,
              strategy,
              run,
              resolved: resolution.length,
            });
          }
          savedTargets.set(key, targets);
          const result = await page.evaluate(
            async ({ count, counters }) => {
              const probe = globalThis.__componentFanout;
              const fields = [...document.querySelectorAll('[data-field]')];
              const texts = fields.map((element) => element.firstChild);
              const expected = Array(count).fill(0);
              const frame = () =>
                new Promise((resolve) =>
                  requestAnimationFrame(() => requestAnimationFrame(resolve)),
                );
              function validate() {
                const current = [...document.querySelectorAll('[data-field]')];
                if (current.length !== count)
                  throw new Error('Wrong field count');
                current.forEach((element, i) => {
                  if (element !== fields[i] || element.firstChild !== texts[i])
                    throw new Error('Lost DOM identity');
                  if (
                    element.dataset.field !== String(i) ||
                    element.textContent !== String(expected[i])
                  )
                    throw new Error('Wrong field value');
                });
              }
              const click = (action) =>
                new Promise((resolve, reject) => {
                  const observer = new MutationObserver(() => {
                    const domMs = performance.now() - started;
                    observer.disconnect();
                    clearTimeout(timeout);
                    resolve({ domMs, dispatchMs });
                  });
                  const timeout = setTimeout(() => {
                    observer.disconnect();
                    reject(new Error('No field update'));
                  }, 3000);
                  observer.observe(document.querySelector('#mount'), {
                    subtree: true,
                    characterData: true,
                    childList: true,
                  });
                  const started = performance.now();
                  document.querySelector(`[data-action="${action}"]`).click();
                  const dispatchMs = performance.now() - started;
                });
              validate();
              await frame();
              const actions = [],
                reads = [];
              for (const [action, index] of [
                ['update-one', 0],
                ['update-tenth', count - 1],
              ]) {
                for (let i = 0; i < (counters ? 1 : 10); i++) {
                  probe.reset();
                  expected[index]++;
                  const time = await click(action);
                  validate();
                  if (counters) reads.push({ index, ...probe.reads() });
                  else if (i >= 2) actions.push({ index, ...time });
                  await frame();
                }
              }
              return {
                actions,
                reads,
                effects: probe.effects().length,
                checks: { data: true, nodes: true, texts: true },
              };
            },
            { count, counters },
          );
          assert.deepEqual(errors, []);
          const cdp = await context.newCDPSession(page);
          await cdp.send('HeapProfiler.collectGarbage');
          const memory = await cdp.send('Runtime.getHeapUsage');
          await page.evaluate(() => globalThis.__componentFanout.destroy());
          const destroyed = await page.evaluate(() => ({
            fields: document.querySelectorAll('[data-field]').length,
            effects: globalThis.__componentFanout.effects().length,
          }));
          assert.deepEqual(destroyed, { fields: 0, effects: 0 });
          if (counters)
            for (const entry of result.reads) {
              assert.equal(entry.renders, strategy === 'component' ? 1 : 0);
              assert.deepEqual(
                entry.fields,
                Array.from({ length: count }, (_, i) =>
                  strategy === 'component' || i === entry.index ? 1 : 0,
                ),
              );
            }
          const sample = {
            fields: count,
            strategy,
            run,
            mountMs,
            ...result,
            heapMiB: memory.usedSize / 1024 ** 2,
            destroyed,
          };
          (counters ? report.counters : report.samples).push(sample);
          await save();
          console.log(
            `fanout fields=${count} ${strategy} ${counters ? 'counter' : `run=${run + 1}`}: ${result.effects} effects; checks passed`,
          );
        } finally {
          await context.close();
        }
      }
    }
  assert.equal(report.samples.length, 12);
  assert.equal(report.counters.length, 4);
  report.status = 'complete';
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
  await save();
}
console.log(`Report: ${output}/results.json`);
