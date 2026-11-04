#!/usr/bin/env node
// Diagnostic experiments only: every runtime/plugin patch is made in a disposable snapshot.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(
  process.env.CRAFT_PERF_EXAM_REPORT ??
    join(workspace, 'tmp/performance-examination'),
);
await mkdir(output, { recursive: true });
const scratch = await mkdtemp(join(workspace, 'tmp/performance-examination-'));
for (const file of [
  'apps/performance-smoke',
  'libs/core',
  'libs/component',
  'libs/style',
  'tsconfig.base.json',
  'package.json',
  'tools/vite-production-options.mjs',
]) {
  await cp(join(workspace, file), join(scratch, file), { recursive: true });
}
const root = join(scratch, 'apps/performance-smoke');
const mainPath = 'apps/performance-smoke/src/main.ts';
const tracePath = 'libs/core/src/lib/template-trace.ts';
const injectorPath = 'libs/core/src/lib/host/craft-injector.ts';
const runtimePath = 'libs/core/src/lib/craft-runtime-mode.ts';
const renderPath = 'libs/component/src/lib/render/interpreter.ts';
const pluginPath = 'libs/style/src/plugin/vite.ts';
const scopePath = 'libs/component/src/lib/render/scope-id.ts';
const corePath = 'libs/core/src/index.ts';
const original = new Map();
for (const file of [
  mainPath,
  tracePath,
  injectorPath,
  runtimePath,
  renderPath,
  pluginPath,
  scopePath,
  corePath,
  'apps/performance-smoke/src/version.ts',
  'apps/performance-smoke/src/smoke.style.ts',
]) {
  original.set(file, await readFile(join(scratch, file), 'utf8'));
}
const hash = createHash('sha256');
async function hashTree(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
    (a, b) => a.name.localeCompare(b.name),
  )) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await hashTree(file);
    else {
      hash.update(file.slice(scratch.length));
      hash.update(await readFile(file));
    }
  }
}
await hashTree(join(scratch, 'libs'));
const report = {
  measuredAt: new Date().toISOString(),
  sourceSha256: hash.digest('hex'),
  environment: { node: process.version, cpu: cpus()[0]?.model },
  settings: {
    runs: Number(process.env.CRAFT_PERF_EXAM_RUNS ?? 5),
    source: 'frozen workspace copy including uncommitted changes',
  },
  experiments: [],
};
const selected = new Set(
  (
    process.env.CRAFT_PERF_EXAMS ??
    'diagnostics,lists,modules,css,typescript,memory'
  ).split(','),
);
const runs = Number(process.env.CRAFT_PERF_EXAM_RUNS ?? 5);
assert(Number.isInteger(runs) && runs > 0);
console.log(`Frozen runtime: ${report.sourceSha256}`);
const browser = await chromium.launch({ headless: true });
report.environment.chromium = browser.version();
let activeServer;
let caseNumber = 0;
try {
  if (selected.has('diagnostics')) await diagnostics();
  if (selected.has('lists')) await lists();
  if (selected.has('modules')) await modules();
  if (selected.has('css')) await css();
  if (selected.has('typescript')) await typescript();
  if (selected.has('memory')) await memoryControls();
} finally {
  if (activeServer) await activeServer.close();
  await browser.close();
  await writeFile(
    join(output, 'report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await rm(scratch, { recursive: true, force: true });
}
console.log(`Examination complete: ${join(output, 'report.json')}`);

function replace(source, from, to) {
  assert(
    source.includes(from),
    `Snapshot no longer matches probe: ${String(from).slice(0, 90)}`,
  );
  return source.replace(from, to);
}
async function patch(file, from, to) {
  const path = join(scratch, file);
  await writeFile(path, replace(await readFile(path, 'utf8'), from, to));
}
async function runCase(name, mutate, job, overrides = {}) {
  for (const [file, text] of original)
    await writeFile(join(scratch, file), text);
  // Permit a production runtime on the dev server, independently of bundling.
  await patch(
    mainPath,
    "parameters.get('runtime') === 'development' || import.meta.env.DEV",
    "(parameters.get('runtime') ?? (import.meta.env.DEV ? 'development' : 'production')) === 'development'",
  );
  await mutate?.();
  const started = performance.now();
  activeServer = await createServer({
    configFile: join(root, 'vite.config.ts'),
    cacheDir: join(scratch, `cache-${caseNumber++}`),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: true },
    ...overrides,
  });
  await activeServer.listen();
  const port = activeServer.httpServer.address().port;
  const result = { name, serverReadyMs: performance.now() - started };
  try {
    await job(`http://127.0.0.1:${port}`, result);
    report.experiments.push(result);
    await writeFile(
      join(output, 'report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    console.log(JSON.stringify(result));
  } finally {
    await activeServer.close();
    activeServer = undefined;
  }
}
async function visit(url, rows = 1000, query = '', beforeNavigation) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await beforeNavigation?.(page, context);
    await page.goto(`${url}/?rows=${rows}${query}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__smoke?.readyMs !== undefined);
    assert.equal(await page.locator('[data-row]').count(), rows);
    assert.deepEqual(errors, []);
    const startup = await page.evaluate(() => ({
      ...window.__smoke,
      requests: performance.getEntriesByType('resource').length,
      decodedBytes: performance
        .getEntriesByType('resource')
        .reduce((n, e) => n + e.decodedBodySize, 0),
    }));
    return { context, page, startup, errors };
  } catch (error) {
    await context.close();
    throw new Error(`${error.message}\n${errors.join('\n')}`);
  }
}
async function reverse(page, count = 10) {
  return page.evaluate(async (count) => {
    const result = [];
    for (let i = 0; i < count + 2; i++) {
      const before = [...document.querySelectorAll('[data-row]')];
      const rendered = window.__smoke.renders;
      const started = performance.now();
      document.getElementById('reverse').click();
      await Promise.resolve();
      const elapsed = performance.now() - started;
      const after = [...document.querySelectorAll('[data-row]')];
      if (
        after.some((node, index) => node !== before[before.length - index - 1])
      )
        throw new Error('Lost keyed DOM identity');
      if (
        after.some(
          (node, index) =>
            Number(node.getAttribute('data-row')) !==
            (i % 2 === 0 ? before.length - index - 1 : index),
        )
      )
        throw new Error('Wrong list order');
      if (i >= 2)
        result.push({
          ms: elapsed,
          childRenders: window.__smoke.renders - rendered,
        });
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
    }
    return result;
  }, count);
}
function median(values) {
  return [...values].sort((a, b) => a - b)[Math.ceil(values.length / 2) - 1];
}
async function timingSeries(url, query = '', rows = 1000) {
  const startup = [];
  let actions;
  for (let i = 0; i < runs; i++) {
    const visitResult = await visit(url, rows, query);
    try {
      startup.push(visitResult.startup);
      if (i === runs - 1) actions = await reverse(visitResult.page);
      assert.deepEqual(visitResult.errors, []);
    } finally {
      await visitResult.context.close();
    }
  }
  return {
    bootstrapMedianMs: median(startup.map((x) => x.bootstrapMs)),
    readyMedianMs: median(startup.map((x) => x.readyMs)),
    reverseMedianMs: median(actions.map((x) => x.ms)),
    reverseChildRenders: median(actions.map((x) => x.childRenders)),
    startup,
    actions,
  };
}

async function provideDiagnosticWrapper() {
  await patch(
    mainPath,
    "import 'virtual:craft-style.css';",
    "import 'virtual:craft-style.css';\nimport { provideTemplateTrace } from '@craft-ts/core';",
  );
  await patch(
    mainPath,
    'providers: [provideCraftRootComponent(App)]',
    'providers: [provideTemplateTrace((_context, next) => { window.__wrapperInvocations = (window.__wrapperInvocations ?? 0) + 1; return next(); }), provideCraftRootComponent(App)]',
  );
}

async function diagnostics() {
  await runCase('diagnostics-baseline', null, async (url, result) => {
    result.development = await timingSeries(url);
    result.productionRuntime = await timingSeries(url, '&runtime=production');
    const v = await visit(url, 1000);
    try {
      const session = await v.context.newCDPSession(v.page);
      await session.send('Profiler.enable');
      await session.send('Profiler.setSamplingInterval', { interval: 100 });
      await session.send('Profiler.start');
      await reverse(v.page, 12);
      const { profile } = await session.send('Profiler.stop');
      await writeFile(
        join(output, 'diagnostics-reverse.cpuprofile'),
        JSON.stringify(profile),
      );
      result.profile = summarizeProfile(profile);
    } finally {
      await v.context.close();
    }
  });
  for (const withWrapper of [false, true]) {
    await runCase(
      withWrapper ? 'diagnostics-wrapper-counts' : 'diagnostics-counts',
      async () => {
        await patch(
          tracePath,
          '): Children {\n  if (!isCraftDevelopment',
          '): Children {\n  const probe = (globalThis as any).__traceProbe ??= { calls: 0, missingProviderErrors: 0 }; probe.calls++;\n  if (!isCraftDevelopment',
        );
        await patch(
          injectorPath,
          'function missingProviderError(token: object): Error {',
          'function missingProviderError(token: object): Error {\n  if (tokenName(token) === "TemplateTracesServiceToken") { const probe = (globalThis as any).__traceProbe; if (probe) probe.missingProviderErrors++; }',
        );
        if (withWrapper) await provideDiagnosticWrapper();
      },
      async (url, result) => {
        const v = await visit(url);
        const counts = () =>
          v.page.evaluate(() => ({
            ...window.__traceProbe,
            wrapperCalls: window.__wrapperInvocations ?? 0,
          }));
        try {
          result.startupCounts = await counts();
          // Record one reversal, restore initial order, then exercise repeated reversals.
          await v.page.evaluate(() =>
            document.getElementById('reverse').click(),
          );
          result.afterReverseCounts = await counts();
          await v.page.evaluate(() =>
            document.getElementById('reverse').click(),
          );
          await reverse(v.page, 10);
          result.afterRepeatedReverseCounts = await counts();
          for (const count of [
            result.startupCounts,
            result.afterReverseCounts,
            result.afterRepeatedReverseCounts,
          ]) {
            assert(count.calls > 0);
            assert.equal(count.missingProviderErrors, 0);
            assert.equal(count.wrapperCalls, withWrapper ? count.calls : 0);
          }
          assert(
            result.afterRepeatedReverseCounts.calls >
              result.afterReverseCounts.calls,
          );
          assert.deepEqual(v.errors, []);
        } finally {
          await v.context.close();
        }
        const production = await visit(url, 1000, '&runtime=production');
        try {
          await reverse(production.page);
          result.productionCounts = await production.page.evaluate(() => ({
            ...window.__traceProbe,
            wrapperCalls: window.__wrapperInvocations ?? 0,
          }));
          assert(result.productionCounts.calls > 0);
          assert.equal(result.productionCounts.missingProviderErrors, 0);
          assert.equal(result.productionCounts.wrapperCalls, 0);
          assert.deepEqual(production.errors, []);
        } finally {
          await production.context.close();
        }
      },
    );
  }
  await runCase(
    'diagnostics-cache-template-lookups',
    async () => {
      const text = await readFile(join(scratch, tracePath), 'utf8');
      const start = text.indexOf('export const ɵinjectTemplateTraces =');
      const end = text.indexOf('/** Register one composable', start);
      assert(start > 0 && end > start);
      const lookup = text
        .slice(start, end)
        .replace(
          'export const ɵinjectTemplateTraces =',
          'const perfUncachedTemplateTraces =',
        );
      const replacement = `${lookup}const perfTraceCache = new WeakMap<Injector, readonly TemplateTraceWrapper<unknown>[]>();
export const ɵinjectTemplateTraces = (injector?: Injector): readonly TemplateTraceWrapper<unknown>[] => {
  if (injector && perfTraceCache.has(injector)) return perfTraceCache.get(injector)!;
  const result = perfUncachedTemplateTraces(injector);
  if (injector) perfTraceCache.set(injector, result);
  return result;
};

`;
      await writeFile(
        join(scratch, tracePath),
        text.slice(0, start) + replacement + text.slice(end),
      );
    },
    async (url, result) => {
      result.timing = await timingSeries(url);
    },
  );
  await runCase(
    'diagnostics-cache-mode-only',
    async () => {
      await patch(
        runtimePath,
        'export function craftRuntimeMode(injector: Injector): CraftRuntimeMode {\n  return runInInjectionContext(injector, () => ɵinjectCraftRuntimeMode());\n}',
        `const perfModeCache = new WeakMap<Injector, CraftRuntimeMode>();\nexport function craftRuntimeMode(injector: Injector): CraftRuntimeMode {\n  let mode = perfModeCache.get(injector);\n  if (!mode) { mode = runInInjectionContext(injector, () => ɵinjectCraftRuntimeMode()); perfModeCache.set(injector, mode); }\n  return mode;\n}`,
      );
    },
    async (url, result) => {
      result.timing = await timingSeries(url);
    },
  );
  await runCase(
    'diagnostics-root-noop-wrapper',
    async () => {
      await provideDiagnosticWrapper();
    },
    async (url, result) => {
      result.timing = await timingSeries(url);
      // Positive control: wrappers are executed; tracing has not been disabled.
      const v = await visit(url);
      try {
        result.wrapperCallsAtStartup = await v.page.evaluate(
          () => window.__wrapperInvocations,
        );
        await v.page.evaluate(() => document.getElementById('reverse').click());
        result.wrapperCallsAfterReverse = await v.page.evaluate(
          () => window.__wrapperInvocations,
        );
        assert(
          result.wrapperCallsAtStartup > 0 &&
            result.wrapperCallsAfterReverse > result.wrapperCallsAtStartup,
        );
        assert.deepEqual(v.errors, []);
      } finally {
        await v.context.close();
      }
      result.productionRuntime = await timingSeries(url, '&runtime=production');
      const production = await visit(url, 1000, '&runtime=production');
      try {
        await reverse(production.page);
        result.wrapperCallsInProduction = await production.page.evaluate(
          () => window.__wrapperInvocations ?? 0,
        );
        assert.equal(result.wrapperCallsInProduction, 0);
        assert.deepEqual(production.errors, []);
      } finally {
        await production.context.close();
      }
    },
  );
}

async function lists() {
  for (const indexes of [false, true]) {
    await runCase(
      `lists-reactive-${indexes ? 'with-index' : 'item-only'}`,
      undefined,
      async (url, result) => {
        result.timing = await timingSeries(
          url,
          `&runtime=production&indexes=${indexes}`,
          5000,
        );
        assert.equal(result.timing.reverseChildRenders, 0);
        const v = await visit(
          url,
          1000,
          `&runtime=production&indexes=${indexes}`,
        );
        try {
          await reverse(v.page, 1);
          await v.page.evaluate(() =>
            document.getElementById('update-one').click(),
          );
          assert.equal(
            await v.page.locator('[data-row]').first().textContent(),
            `${indexes ? '1. ' : ''}Row 999!`,
          );
          result.wrongPositions = await v.page
            .locator('[data-position]')
            .evaluateAll(
              (nodes) =>
                nodes.filter(
                  (node, i) => Number(node.getAttribute('data-position')) !== i,
                ).length,
            );
          assert.equal(result.wrongPositions, 0);
          result.updateAfterReorderCorrect = true;
        } finally {
          await v.context.close();
        }
      },
    );
  }
  // Negative control: disabling publication keeps the DOM order but breaks positions.
  await runCase(
    'lists-index-publication-disabled-negative-control',
    () =>
      patch(
        renderPath,
        'entry.indexSignal.set(index);',
        '/* negative control: do not publish */',
      ),
    async (url, result) => {
      const v = await visit(url, 10, '&runtime=production&indexes=true');
      try {
        await reverse(v.page, 1);
        result.wrongPositions = await v.page
          .locator('[data-position]')
          .evaluateAll(
            (nodes) =>
              nodes.filter(
                (node, i) => Number(node.getAttribute('data-position')) !== i,
              ).length,
          );
        assert.equal(result.wrongPositions, 10);
      } finally {
        await v.context.close();
      }
    },
  );
}

async function modules() {
  for (const prebundle of [false, true]) {
    await runCase(
      `modules-${prebundle ? 'prebundled' : 'baseline'}`,
      async () => {
        await writeFile(
          join(scratch, corePath),
          original.get(corePath) +
            "\nexport const __perfSourceVersion = 'library-0';\n",
        );
        await patch(
          mainPath,
          "import 'virtual:craft-style.css';",
          "import 'virtual:craft-style.css';\nimport { __perfSourceVersion } from '@craft-ts/core';",
        );
        await patch(
          mainPath,
          "p({ id: 'version' }, version),",
          "p({ id: 'version' }, version),\n      p({ id: 'library-version' }, __perfSourceVersion),",
        );
      },
      async (url, result) => {
        result.navigations = [];
        let last;
        for (let i = 0; i < runs; i++) {
          const v = await visit(url, 0);
          result.navigations.push(v.startup);
          await last?.context.close();
          last = v;
        }
        try {
          assert.equal(
            await last.page.locator('#library-version').textContent(),
            'library-0',
          );
          const started = performance.now();
          await patch(corePath, "'library-0'", "'library-1'");
          result.libraryEditObserved = await last.page
            .waitForFunction(
              () =>
                document.querySelector('#library-version')?.textContent ===
                'library-1',
              null,
              { timeout: 8000 },
            )
            .then(
              () => true,
              () => false,
            );
          result.libraryEditWaitMs = performance.now() - started;
          assert.deepEqual(last.errors, []);
        } finally {
          await last?.context.close();
        }
        // Ensure optimized entries share one working runtime, not duplicated tokens.
        const v = await visit(url, 1000);
        try {
          result.actions = await reverse(v.page, 5);
        } finally {
          await v.context.close();
        }
      },
      prebundle
        ? {
            optimizeDeps: {
              include: [
                '@craft-ts/core',
                '@craft-ts/component',
                '@craft-ts/style',
              ],
            },
          }
        : {},
    );
  }
}

async function css() {
  for (const sheetOnly of [false, true]) {
    await runCase(
      `css-${sheetOnly ? 'sheet-only-experiment' : 'baseline'}`,
      async () => {
        if (sheetOnly)
          await patch(
            pluginPath,
            "context.server.ws.send({ type: 'full-reload', path: '*' });",
            'return sheet ? [sheet] : [];',
          );
        await writeFile(
          join(root, 'src/main.ts'),
          (await readFile(join(root, 'src/main.ts'), 'utf8')) +
            "\nif (import.meta.hot) import.meta.hot.on('vite:afterUpdate', () => { window.__cssUpdated = true; });\n",
        );
      },
      async (url, result) => {
        const v = await visit(url);
        try {
          let navigations = 0;
          v.page.on('framenavigated', (frame) => {
            if (frame === v.page.mainFrame()) navigations++;
          });
          await v.page.evaluate(() =>
            document.getElementById('increment').click(),
          );
          result.before = await v.page
            .locator('craft-root > div')
            .evaluate((node) => ({
              class: node.className,
              display: getComputedStyle(node).display,
            }));
          const started = performance.now();
          await patch(
            'apps/performance-smoke/src/smoke.style.ts',
            'display.block',
            'display.flex',
          );
          await v.page.waitForFunction(
            (sheetOnly) =>
              sheetOnly
                ? window.__cssUpdated === true
                : window.__smoke?.readyMs !== undefined &&
                  getComputedStyle(document.querySelector('craft-root > div'))
                    .display === 'flex',
            sheetOnly,
          );
          result.updateObservedMs = performance.now() - started;
          result.after = await v.page
            .locator('craft-root > div')
            .evaluate((node) => ({
              class: node.className,
              display: getComputedStyle(node).display,
            }));
          result.countAfter = await v.page.locator('#count').textContent();
          result.documentNavigations = navigations;
          if (sheetOnly) {
            assert.equal(navigations, 0);
            assert.equal(result.countAfter, '1');
            result.moduleReevaluation = await v.page.evaluate(async () => {
              try {
                const module = await import(
                  '/src/smoke.style.ts?t=' + Date.now()
                );
                return { class: module.smokeStyle.root };
              } catch (error) {
                return { error: error.message };
              }
            });
            const expectedClass = report.experiments.find(
              (e) => e.name === 'css-baseline',
            ).after.class;
            result.afterClassRebinding = await v.page.evaluate(
              (expectedClass) => {
                const node = document.querySelector('craft-root > div');
                node.className = expectedClass;
                return {
                  class: node.className,
                  display: getComputedStyle(node).display,
                };
              },
              expectedClass,
            );
            assert.equal(result.afterClassRebinding.display, 'flex');
          } else {
            assert.equal(result.after.display, 'flex');
            assert.equal(navigations, 1);
          }
          assert.deepEqual(v.errors, []);
        } finally {
          await v.context.close();
        }
      },
    );
  }
}

async function typescript() {
  for (const variant of [
    'baseline',
    'remount-hmr-experiment',
    'remount-allow-two-scope-replacements',
  ]) {
    const hmr = variant !== 'baseline';
    const allowReplacement = variant === 'remount-allow-two-scope-replacements';
    await runCase(
      `typescript-${variant}`,
      async () => {
        if (hmr) {
          await patch(
            mainPath,
            'bootstrapCraft({',
            'const appRef = bootstrapCraft({',
          );
          await writeFile(
            join(root, 'src/main.ts'),
            (await readFile(join(root, 'src/main.ts'), 'utf8')) +
              '\nif (import.meta.hot) { import.meta.hot.accept(); import.meta.hot.dispose(() => appRef.destroy()); }\n',
          );
        }
        // Deliberately limited to the two fixture names. This is not a safe generic HMR policy.
        if (allowReplacement)
          await patch(
            scopePath,
            'if (owner && owner !== definition) {',
            "if (owner && owner !== definition && !['PerformanceSmoke', 'SmokeRow'].includes(name)) {",
          );
      },
      async (url, result) => {
        const v = await visit(url);
        try {
          const session = await v.context.newCDPSession(v.page);
          const hmrErrors = [];
          v.page.on('console', (message) => {
            if (message.type() === 'error') hmrErrors.push(message.text());
          });
          let navigations = 0;
          v.page.on('framenavigated', (frame) => {
            if (frame === v.page.mainFrame()) navigations++;
          });
          const memory = async () => {
            await session.send('HeapProfiler.collectGarbage');
            return {
              ...(await session.send('Memory.getDOMCounters')),
              ...(await session.send('Runtime.getHeapUsage')),
            };
          };
          result.edits = [];
          for (let i = 0; i < 10; i++) {
            await v.page.evaluate(() =>
              document.getElementById('increment').click(),
            );
            assert.equal(await v.page.locator('#count').textContent(), '1');
            const version = `exam-${i}`;
            const started = performance.now();
            await writeFile(
              join(root, 'src/version.ts'),
              `export const version = '${version}';\n`,
            );
            const updated = await v.page
              .waitForFunction(
                (version) =>
                  document.querySelector('#version')?.textContent === version,
                version,
                { timeout: 4000 },
              )
              .then(
                () => true,
                () => false,
              );
            if (!updated) {
              assert(
                hmr &&
                  !allowReplacement &&
                  hmrErrors.some((message) =>
                    message.includes('style scope name'),
                  ),
                `Unexpected reload failure: ${hmrErrors.join('\n')}`,
              );
              result.blockedByScopeRegistry = true;
              result.errors = hmrErrors;
              result.documentNavigations = navigations;
              result.rowsAfterFailure = await v.page
                .locator('[data-row]')
                .count();
              return;
            }
            await v.page.evaluate(
              () =>
                new Promise((resolve) =>
                  requestAnimationFrame(() => requestAnimationFrame(resolve)),
                ),
            );
            result.edits.push({
              ms: performance.now() - started,
              countAfter: await v.page.locator('#count').textContent(),
            });
            assert.equal(await v.page.locator('[data-row]').count(), 1000);
            assert.equal(result.edits.at(-1).countAfter, '0');
            if (i === 1) result.afterTwoEdits = await memory();
          }
          result.afterTenEdits = await memory();
          result.documentNavigations = navigations;
          result.editMedianMs = median(result.edits.map((e) => e.ms));
          assert.equal(navigations, hmr ? 0 : 10);
          assert.deepEqual(v.errors, []);
        } finally {
          await v.context.close();
        }
      },
    );
  }
}

function summarizeProfile(profile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map();
  for (const node of profile.nodes)
    for (const id of node.children ?? []) parent.set(id, node.id);
  const self = new Map();
  const inclusive = new Map();
  for (let i = 0; i < (profile.samples?.length ?? 0); i++) {
    const id = profile.samples[i];
    const delta = (profile.timeDeltas?.[i] ?? 0) / 1000;
    self.set(id, (self.get(id) ?? 0) + delta);
    for (
      let ancestor = id;
      ancestor !== undefined;
      ancestor = parent.get(ancestor)
    )
      inclusive.set(ancestor, (inclusive.get(ancestor) ?? 0) + delta);
  }
  const rank = (map) =>
    [...map]
      .map(([id, ms]) => ({
        ms,
        function: nodes.get(id).callFrame.functionName,
        file: nodes.get(id).callFrame.url.replace(scratch, '<snapshot>'),
        line: nodes.get(id).callFrame.lineNumber + 1,
      }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 25);
  const groupedSelf = new Map();
  for (const [id, ms] of self) {
    const frame = nodes.get(id).callFrame;
    const key = JSON.stringify([
      frame.functionName,
      frame.url,
      frame.lineNumber,
    ]);
    const entry = groupedSelf.get(key) ?? {
      ms: 0,
      function: frame.functionName,
      file: frame.url.replace(scratch, '<snapshot>'),
      line: frame.lineNumber + 1,
    };
    entry.ms += ms;
    groupedSelf.set(key, entry);
  }
  return {
    self: rank(self),
    groupedSelf: [...groupedSelf.values()]
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 20),
    inclusive: rank(inclusive),
    note: 'Sampling estimates, overlapping inclusive stacks; includes frame waits.',
  };
}

async function memoryControls() {
  const readMemory = async (session) => {
    await session.send('HeapProfiler.collectGarbage');
    return {
      ...(await session.send('Memory.getDOMCounters')),
      ...(await session.send('Runtime.getHeapUsage')),
    };
  };
  await runCase(
    'memory-remount-same-module',
    async () => {
      await patch(
        mainPath,
        'bootstrapCraft({',
        'let appRef = bootstrapCraft({',
      );
      await writeFile(
        join(root, 'src/main.ts'),
        (await readFile(join(root, 'src/main.ts'), 'utf8')) +
          "\nwindow.__remount = () => { appRef.destroy(); appRef = bootstrapCraft({ config: craftAppConfig({ providers: [provideCraftRootComponent(App)] }), mode: 'development' }); };\n",
      );
    },
    async (url, result) => {
      const v = await visit(url);
      try {
        const session = await v.context.newCDPSession(v.page);
        result.checkpoints = [];
        for (let i = 1; i <= 100; i++) {
          await v.page.evaluate(() => window.__remount());
          await v.page.evaluate(
            () =>
              new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)),
              ),
          );
          assert.equal(await v.page.locator('[data-row]').count(), 1000);
          await v.page.evaluate(() =>
            document.getElementById('increment').click(),
          );
          assert.equal(await v.page.locator('#count').textContent(), '1');
          if ([2, 10, 30, 60, 100].includes(i))
            result.checkpoints.push({
              remounts: i,
              ...(await readMemory(session)),
            });
        }
        assert.deepEqual(v.errors, []);
      } finally {
        await v.context.close();
      }
    },
  );
  await runCase(
    'memory-leaf-module-hmr',
    async () => {
      await writeFile(
        join(root, 'src/main.ts'),
        (await readFile(join(root, 'src/main.ts'), 'utf8')) +
          "\nif (import.meta.hot) import.meta.hot.accept('./version', module => { document.getElementById('version').textContent = module.version; });\n",
      );
    },
    async (url, result) => {
      const v = await visit(url);
      try {
        const session = await v.context.newCDPSession(v.page);
        await v.page.evaluate(() =>
          document.getElementById('increment').click(),
        );
        result.checkpoints = [];
        let navigations = 0;
        v.page.on('framenavigated', (frame) => {
          if (frame === v.page.mainFrame()) navigations++;
        });
        for (let i = 1; i <= 10; i++) {
          const version = `leaf-${i}`;
          await writeFile(
            join(root, 'src/version.ts'),
            `export const version = '${version}';\n`,
          );
          await v.page.waitForFunction(
            (version) =>
              document.querySelector('#version')?.textContent === version,
            version,
          );
          assert.equal(await v.page.locator('#count').textContent(), '1');
          assert.equal(await v.page.locator('[data-row]').count(), 1000);
          if ([2, 10].includes(i))
            result.checkpoints.push({
              edits: i,
              ...(await readMemory(session)),
            });
        }
        assert.equal(navigations, 0);
        result.documentNavigations = navigations;
        assert.deepEqual(v.errors, []);
      } finally {
        await v.context.close();
      }
    },
  );
}
