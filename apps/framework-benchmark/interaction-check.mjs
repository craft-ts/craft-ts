#!/usr/bin/env node
// Native trusted clicks complement the synthetic DOM timing; this is a lab probe, not field INP.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { cpus } from 'node:os';
import { build, preview } from 'vite';
import { chromium } from '@playwright/test';
const root = dirname(fileURLToPath(import.meta.url)),
  workspace = resolve(root, '../..');
const destination = resolve(
  workspace,
  process.env.CRAFT_INPUT_REPORT ??
    'tmp/mount-diagnosis/native-interactions.json',
);
await mkdir(dirname(destination), { recursive: true });
const configFile = join(root, 'vite.config.mjs'),
  dist = resolve(workspace, 'tmp/mount-diagnosis/native-dist');
await build({
  configFile,
  logLevel: 'error',
  build: {
    outDir: dist,
    rolldownOptions: { input: join(root, 'craft/index.html') },
  },
});
const server = await preview({
  configFile,
  logLevel: 'error',
  build: { outDir: dist },
});
const browser = await chromium.launch({ headless: true });
const url = `http://127.0.0.1:${server.httpServer.address().port}`;
const report = {
  measuredAt: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    cwd: workspace,
  }).trim(),
  environment: {
    node: process.version,
    cpu: cpus()[0].model,
    chromium: browser.version(),
  },
  method:
    'Native Playwright clicks. Event Timing threshold 16ms; entries grouped by interactionId. No entry is not a zero-duration measurement. No field INP conclusion.',
  samples: [],
};
try {
  for (const scenario of [
    { rows: 100, indexes: false, cpu: 1 },
    { rows: 1000, indexes: false, cpu: 1 },
    { rows: 5000, indexes: false, cpu: 1 },
    { rows: 100, indexes: false, cpu: 4 },
    { rows: 1000, indexes: false, cpu: 4 },
    { rows: 5000, indexes: false, cpu: 4 },
    { rows: 1000, indexes: true, cpu: 1 },
    { rows: 1000, indexes: true, cpu: 4 },
  ]) {
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      }),
      page = await context.newPage(),
      errors = [];
    try {
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(() => {
        window.__inputProbe = {
          events: [],
          longTasks: [],
          clicks: [],
          supported: PerformanceObserver.supportedEntryTypes.includes('event'),
        };
        new PerformanceObserver((list) =>
          window.__inputProbe.longTasks.push(
            ...list
              .getEntries()
              .map((e) => ({ start: e.startTime, duration: e.duration })),
          ),
        ).observe({ type: 'longtask', buffered: true });
        new PerformanceObserver((list) =>
          window.__inputProbe.events.push(
            ...list.getEntries().map((e) => ({
              name: e.name,
              start: e.startTime,
              duration: e.duration,
              processingStart: e.processingStart,
              processingEnd: e.processingEnd,
              interactionId: e.interactionId,
            })),
          ),
        ).observe({ type: 'event', buffered: true, durationThreshold: 16 });
        document.addEventListener(
          'click',
          (e) =>
            window.__inputProbe.clicks.push({
              trusted: e.isTrusted,
              action: e.target.closest('[data-action]')?.dataset.action,
              at: performance.now(),
            }),
          true,
        );
      });
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: scenario.cpu });
      await page.goto(
        `${url}/craft/?rows=${scenario.rows}&indexes=${scenario.indexes}`,
      );
      await page.waitForFunction(() =>
        Number.isFinite(window.__bench?.bootstrapMs),
      );
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const mount = await page.evaluate(() => ({
        bootstrapMs: window.__bench.bootstrapMs,
        start: window.__bench.started,
        end: window.__bench.started + window.__bench.bootstrapMs,
      }));
      let expected = Array.from({ length: scenario.rows }, (_, id) => ({
          id,
          label: `Row ${id}`,
        })),
        filtered = false,
        revision = 0;
      const actions = [];
      for (const action of [
        'update-one',
        'update-tenth',
        'reverse',
        'filter',
        'filter',
        'reverse',
        'update-one',
        'update-tenth',
      ]) {
        const eventIndex = await page.evaluate(
          () => window.__inputProbe.events.length,
        );
        await page.evaluate(() => {
          window.__beforeNodes = new Map(
            [...document.querySelectorAll('[data-row]')].map((node) => [
              node.dataset.row,
              node,
            ]),
          );
        });
        if (action === 'update-one' || action === 'update-tenth')
          expected = expected.map((row, i) =>
            (action === 'update-one' ? i === 0 : i % 10 === 0)
              ? { ...row, label: row.label + '!' }
              : row,
          );
        else if (action === 'reverse') expected.reverse();
        else filtered = !filtered;
        await page.locator(`[data-action="${action}"]`).click();
        await page.waitForFunction(
          (expected) =>
            Number(document.querySelector('#rows')?.dataset.revision) ===
            expected,
          ++revision,
        );
        // The validation starts after an opportunity to paint the user interaction.
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        const result = await page.evaluate(
          ({ data, indexes, eventIndex }) => {
            const nodes = [...document.querySelectorAll('[data-row]')];
            if (nodes.length !== data.length) throw new Error('Wrong count');
            nodes.forEach((node, i) => {
              if (
                Number(node.dataset.row) !== data[i].id ||
                node.textContent !==
                  `${indexes ? `${i + 1}. ` : ''}${data[i].label}`
              )
                throw new Error('Wrong data');
              if (
                indexes &&
                Number(
                  node.querySelector('[data-position]')?.dataset.position,
                ) !== i
              )
                throw new Error('Wrong index');
              if (
                window.__beforeNodes.has(node.dataset.row) &&
                window.__beforeNodes.get(node.dataset.row) !== node
              )
                throw new Error('Lost identity');
            });
            const events = window.__inputProbe.events
              .slice(eventIndex)
              .filter((e) => e.interactionId > 0);
            return {
              events,
              maxReportedMs: events.length
                ? Math.max(...events.map((e) => e.duration))
                : null,
              lastClick: window.__inputProbe.clicks.at(-1),
            };
          },
          {
            data: filtered
              ? expected.filter((row) => row.id % 2 === 0)
              : expected,
            indexes: scenario.indexes,
            eventIndex,
          },
        );
        assert.equal(result.lastClick.trusted, true);
        assert.equal(result.lastClick.action, action);
        actions.push({
          action:
            action === 'filter' ? (filtered ? 'filter' : 'restore') : action,
          ...result,
        });
      }
      await page.evaluate(
        () => new Promise((resolve) => setTimeout(resolve, 150)),
      );
      const probe = await page.evaluate(() => window.__inputProbe);
      assert.equal(probe.supported, true);
      assert.deepEqual(errors, []);
      // Observer batches can arrive after the next action. Associate by the
      // browser's interactionId and processingStart, not callback arrival time.
      const groups = new Map();
      for (const event of probe.events)
        if (event.interactionId > 0) {
          const group = groups.get(event.interactionId) ?? [];
          group.push(event);
          groups.set(event.interactionId, group);
        }
      for (const action of actions) {
        action.events = [];
        action.maxReportedMs = null;
      }
      for (const [id, events] of groups) {
        const pivot =
          events.find((event) => event.name === 'click') ?? events.at(-1);
        const target = actions.reduce((best, action) =>
          Math.abs(action.lastClick.at - pivot.processingStart) <
          Math.abs(best.lastClick.at - pivot.processingStart)
            ? action
            : best,
        );
        assert(
          Math.abs(target.lastClick.at - pivot.processingStart) < 8,
          `Unmatched interaction ${id}`,
        );
        target.events.push(...events);
        target.maxReportedMs = Math.max(
          ...target.events.map((event) => event.duration),
        );
      }
      for (const action of actions)
        assert(
          new Set(action.events.map((event) => event.interactionId)).size <= 1,
        );
      assert.equal(probe.clicks.length, 8);
      assert(probe.clicks.every((click) => click.trusted));
      const mountTasks = probe.longTasks.filter(
        (e) => e.start < mount.end && e.start + e.duration > mount.start,
      );
      report.samples.push({
        ...scenario,
        mount: { ...mount, longTasks: mountTasks },
        actions,
        allEvents: probe.events,
        errors,
      });
      await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
      console.log(
        `${scenario.rows} indexes=${scenario.indexes} cpu=${scenario.cpu}: mount=${mount.bootstrapMs.toFixed(1)}ms; trusted clicks checked`,
      );
    } finally {
      await context.close();
    }
  }
  report.status = 'complete';
} catch (error) {
  report.failure = { message: error.message, stack: error.stack };
  throw error;
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
  await writeFile(destination, JSON.stringify(report, null, 2) + '\n');
}
console.log(`Report: ${destination}`);
